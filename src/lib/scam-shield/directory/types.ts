import type { OfficialEntity } from '../types'

export type { OfficialEntity }

export interface DirectoryService {
  lookup(domain: string): Promise<OfficialEntity | null>
  getAll(): Promise<OfficialEntity[]>
}
