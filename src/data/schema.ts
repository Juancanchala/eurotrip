import { z } from 'zod';
import type { TripData } from '../engine/types';

const nonNeg = z.number().finite().nonnegative();
const id = z.string().min(1).max(40);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const CostSchema = z
  .object({
    eur: nonNeg,
    cop: nonNeg.optional(),
    min: nonNeg.optional(),
    max: nonNeg.optional(),
    status: z.enum(['estimado', 'cotizado', 'reservado']),
    source: z.string().url().optional(),
    checkedAt: isoDate.optional(),
    note: z.string().max(500).optional(),
  });

export const PlaceSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  country: z.string().max(40),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().max(300).optional(),
});

export const LegSchema = z.object({
  id,
  from: id,
  to: id,
  mode: z.enum(['tren', 'vuelo', 'bus', 'auto']),
  hours: z.number().positive().max(48),
  cost: CostSchema,
  label: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
  risk: z.string().max(500).optional(),
});

export const StaySchema = z.object({
  placeId: id,
  nights: z.number().int().min(0).max(30),
  lodgingPerNight: CostSchema,
  mealsPerDay: CostSchema,
  localPerDay: CostSchema,
  note: z.string().max(300).optional(),
});

export const ScenarioSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  kind: z.enum(['abierto', 'ida_vuelta']),
  summary: z.string().max(500),
  legs: z.array(LegSchema).max(30),
  stays: z.array(StaySchema).max(20),
});

export const SettingsSchema = z.object({
  startDate: isoDate,
  totalDays: z.number().int().min(1).max(60),
  fixedDays: z.number().int().min(0).max(10),
  budgetEUR: nonNeg,
  budgetDraft: z.boolean().default(true),
  baseRate: z.number().positive().max(100_000),
  cushionPct: z.number().min(0).max(30),
  priceAdjustPct: z.number().min(-20).max(50).default(4),
  hubPlaceIds: z.array(id).min(1),
  homeDaily: CostSchema,
  travelers: z.object({
    adults: z.number().int().min(1).max(10),
    children: z.number().int().min(0).max(10),
    childAges: z.array(z.number().int().min(0).max(17)),
    childrenLabel: z.string().max(40).optional(),
  }),
  selectedScenarioId: id,
  itinerary: z
    .object({
      restDaysOnArrival: z.number().int().min(0).max(10),
      gapDaysBetweenTrips: z.number().int().min(0).max(10),
    })
    .default({ restDaysOnArrival: 2, gapDaysBetweenTrips: 2 }),
});

export const AlertSchema = z.object({
  id,
  from: isoDate,
  to: isoDate,
  placeIds: z.array(id),
  labelIncludes: z.string().max(40).optional(),
  level: z.enum(['info', 'aviso']),
  message: z.string().min(1).max(400),
  source: z.string().url().optional(),
});

export const TripDataSchema = z.object({
  version: z.literal(1),
  seedRevision: z.number().int().min(1).default(1),
  settings: SettingsSchema,
  places: z.array(PlaceSchema).min(1),
  scenarios: z.array(ScenarioSchema).min(1).max(6),
  common: z.array(z.object({ id, label: z.string().max(100), cost: CostSchema })),
  extras: z.array(
    z.object({
      id,
      name: z.string().max(60),
      placeId: id,
      minDays: z.number().int().min(1).max(30),
      cost: CostSchema,
      summary: z.string().max(300),
    }),
  ),
  alerts: z.array(AlertSchema).max(60).default([]),
  assumptions: z.array(z.string().max(400)).max(40),
});

// Garantiza en compilación que el esquema y los tipos del motor coinciden.
type Parsed = z.infer<typeof TripDataSchema>;
const _check: [Parsed extends TripData ? true : false, TripData extends Parsed ? true : false] = [true, true];
void _check;

export function parseTrip(input: unknown): { ok: true; data: TripData } | { ok: false; errors: string[] } {
  const r = TripDataSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data as TripData };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
  };
}
