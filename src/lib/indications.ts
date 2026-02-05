export type IndicationOption = {
  id: string;
  label: string;
};

export const INDICATIONS: IndicationOption[] = [
  { id: "EFO_0000565", label: "Leukemia" },
];

export const DEFAULT_INDICATION_ID = INDICATIONS[0]?.id ?? "";

export function isValidIndication(id: string) {
  return INDICATIONS.some((option) => option.id === id);
}

export function getIndicationLabel(id: string) {
  const match = INDICATIONS.find((option) => option.id === id);
  return match?.label ?? id;
}
