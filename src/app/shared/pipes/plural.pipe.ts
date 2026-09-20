import { Pipe, PipeTransform } from '@angular/core';

/**
 * A count and its noun, agreeing with each other.
 *
 *     {{ 1 | plural: 'room' }}      ->  1 room
 *     {{ 4 | plural: 'room' }}      ->  4 rooms
 *     {{ 2 | plural: 'entry':'entries' }}  ->  2 entries
 *
 * Written because "3 room(s)" was appearing in about a dozen places. The
 * parenthesis is a note from the developer to the reader saying "I did not
 * know how many there would be" — but the page does know, at the moment it
 * renders. It is the one piece of copy on a screen that is never right.
 *
 * Irregular plurals are passed explicitly rather than guessed: a rule that
 * handles "entries" also has to handle "addresses", "storeys" and
 * "tenancies", and a half-correct rule is worse than an argument.
 */
@Pipe({ name: 'plural', standalone: true })
export class PluralPipe implements PipeTransform {
  transform(count: number | null | undefined, singular: string, plural?: string): string {
    const value = Number(count ?? 0);
    const safe = Number.isFinite(value) ? value : 0;

    return `${safe.toLocaleString()} ${safe === 1 ? singular : plural ?? singular + 's'}`;
  }
}
