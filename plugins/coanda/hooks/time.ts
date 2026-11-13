// Clock text and day keys have one home (spine AD-4). Both read the machine's own time zone: no
// zone is named here, so a person in Lisbon sees Lisbon time.

const two = (n: number): string => String(n).padStart(2, '0')

// "HH:MM", 24-hour, for when something happened.
export function clockTime(at: number): string {
  const d = new Date(at)

  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

// "YYYY-MM-DD" of the day `at` falls in.
export function dayKey(at: number): string {
  const d = new Date(at)

  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}
