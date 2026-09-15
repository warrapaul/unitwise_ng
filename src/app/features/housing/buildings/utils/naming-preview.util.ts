import { BuildingNamingConvention } from "../../models/housing.models";

/** Convert number to letter(s): 1=A, 2=B, ..., 26=Z, 27=AA, 28=AB, etc. */
function letterFromNumber(n: number): string {
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** 1=1st, 2=2nd, 3=3rd, 4=4th, etc. */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Roman numerals, 1-3999. */
function toRoman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  const thousands = ['', 'M', 'MM', 'MMM'];
  const hundreds = ['', 'C', 'CC', 'CCC', 'CD', 'D', 'DC', 'DCC', 'DCCC', 'CM'];
  const tens = ['', 'X', 'XX', 'XXX', 'XL', 'L', 'LX', 'LXX', 'LXXX', 'XC'];
  const ones = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  return thousands[Math.floor(n / 1000)] +
    hundreds[Math.floor((n % 1000) / 100)] +
    tens[Math.floor((n % 100) / 10)] +
    ones[n % 10];
}

/** Mirrors BuildingNamingConventionService#generateFloorName. */
export function previewFloorName(floor: number, c: BuildingNamingConvention | null | undefined): string {
  switch (c?.floorPattern) {
    case 'FLOOR_WITH_PREFIX': return `${c.floorPrefix || 'Floor'} ${floor}`;
    case 'ORDINAL': return `${ordinal(floor)} Floor`;
    case 'LETTER': return letterFromNumber(floor);
    case 'ROMAN_NUMERAL': return toRoman(floor);
    default: return `floor${floor}`; // FLOOR_NUMBER
  }
}

/** Mirrors BuildingNamingConventionService#generateRoomName. */
export function previewRoomName(
  floor: number,
  room: number,
  roomsPerFloor: number,
  c: BuildingNamingConvention | null | undefined
): string {
  switch (c?.roomPattern) {
    case 'NUMBER_ONLY':
      return String(floor * 100 + room);
    case 'PREFIX_NUMBER':
      return `${c.roomPrefix || 'Room'} ${(floor - 1) * roomsPerFloor + room}`;
    case 'FLOOR_ROOM':
      return `${floor}${c.roomSeparator || '-'}${room}`;
    case 'LETTER_SEQUENTIAL':
      return letterFromNumber((floor - 1) * roomsPerFloor + room);
    default:
      return `${letterFromNumber(room)}${floor}`; // LETTER_NUMBER
  }
}