export type LatLng = [number, number];

/** Colores por tramo (contraste suficiente sobre el mapa claro). */
export const LEG_COLORS = ['#1B6CA8', '#C2410C', '#0F766E', '#6D28D9', '#BE185D', '#4D7C0F', '#92400E', '#334155'];

export function legColor(i: number): string {
  return LEG_COLORS[i % LEG_COLORS.length]!;
}

/**
 * Arco suave entre dos puntos. La curva se dobla hacia un lado según el sentido,
 * así la ida y la vuelta del mismo tramo no se dibujan una encima de la otra.
 */
export function arc(a: LatLng, b: LatLng, bend = 0.18, steps = 24): LatLng[] {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  if (dLat === 0 && dLng === 0) return [a, b];
  // Punto de control: el medio, desplazado en perpendicular.
  const cLat = (lat1 + lat2) / 2 - dLng * bend;
  const cLng = (lng1 + lng2) / 2 + dLat * bend;
  const pts: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([u * u * lat1 + 2 * u * t * cLat + t * t * lat2, u * u * lng1 + 2 * u * t * cLng + t * t * lng2]);
  }
  return pts;
}
