import { fetchCommunityBoundaries, findCommunityAt } from './communityLookup';

/** One requested lookup, using City polygons. Coordinates are never persisted or reverse-geocoded. */
export async function currentCommunity(
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined,
  boundaries = fetchCommunityBoundaries,
): Promise<string> {
  if (!geolocation) throw Error('Location is unavailable in this browser. Enter a neighbourhood or continue without one.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const locate = new Promise<GeolocationCoordinates>((resolve, reject) => geolocation.getCurrentPosition(
      position => resolve(position.coords),
      error => reject(Error(error.code === 1
        ? 'Location permission was declined. You can enter a neighbourhood or continue without one.'
        : 'We couldn’t get your location. Try again, enter a neighbourhood or continue without one.')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    ));
    return await Promise.race([
      locate.then(async point => {
        const name = findCommunityAt(point.latitude, point.longitude, await boundaries());
        if (!name) throw Error('We couldn’t match your location to a Calgary neighbourhood. Choose one yourself or continue without a location.');
        return name.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Nw|Ne|Sw|Se)\b/g, q => q.toUpperCase());
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('The location lookup took too long. Enter a neighbourhood or continue without one.')), 18_000); }),
    ]);
  } finally { clearTimeout(timer); }
}
