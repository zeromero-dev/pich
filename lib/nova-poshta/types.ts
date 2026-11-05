/** Slim shapes our lookup routes return — NP's raw records carry ~60 fields each. */

export type SettlementOption = {
  ref: string
  /** Bare name, e.g. «Вінниця» — what the courier lookup re-searches by. */
  name: string
  /** Disambiguated label, e.g. «м. Вінниця, Вінницька обл.» */
  label: string
  courier: boolean
}

export type WarehouseOption = {
  ref: string
  label: string
}

export type StreetOption = {
  ref: string
  /** Bare name, e.g. «Сковороди» — what checkout re-searches by. */
  name: string
  /** With type, e.g. «вул. Сковороди» */
  label: string
}

export type WarehouseKind = 'branch' | 'locker'
