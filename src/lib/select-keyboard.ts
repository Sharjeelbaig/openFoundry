// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Keyboard navigation maths for the custom dropdown in `src/components/Select.tsx`.
 *
 * The component keeps DOM focus on its trigger and moves a virtual "active
 * option" (exposed through `aria-activedescendant`). These helpers decide which
 * option is active so the behaviour is testable without a DOM.
 */

export interface SelectOptionState {
  value: string;
  disabled: boolean;
}

/** Index of the first option that is not disabled, or -1 when none are. */
export function firstEnabledIndex(options: readonly SelectOptionState[]): number {
  return options.findIndex((option) => !option.disabled);
}

/** Index of the last option that is not disabled, or -1 when none are. */
export function lastEnabledIndex(options: readonly SelectOptionState[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

/**
 * Move `current` by `delta` (+1 down, -1 up), skipping disabled options and
 * wrapping around the ends. Returns -1 for an empty list; when every option is
 * disabled it returns `current` unchanged.
 */
export function stepEnabledIndex(
  options: readonly SelectOptionState[],
  current: number,
  delta: 1 | -1
): number {
  const count = options.length;
  if (count === 0) return -1;
  if (current < 0 || current >= count) {
    return delta === 1 ? firstEnabledIndex(options) : lastEnabledIndex(options);
  }
  let index = current;
  for (let step = 0; step < count; step += 1) {
    index = (index + delta + count) % count;
    if (!options[index].disabled) return index;
  }
  return current;
}

/**
 * The option to make active when the listbox opens: the current selection when
 * it is selectable, otherwise the first enabled option (or -1).
 */
export function initialActiveIndex(
  options: readonly SelectOptionState[],
  selectedValue: string | undefined
): number {
  if (selectedValue !== undefined) {
    const selected = options.findIndex(
      (option) => option.value === selectedValue && !option.disabled
    );
    if (selected >= 0) return selected;
  }
  return firstEnabledIndex(options);
}
