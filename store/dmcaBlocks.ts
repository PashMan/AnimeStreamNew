import { create } from 'zustand';

interface DmcaBlocksState {
  dmcaBlocks: string[];
  setDmcaBlocks: (blocks: string[]) => void;
}

export const useDmcaBlocks = create<DmcaBlocksState>((set) => ({
  dmcaBlocks: [],
  setDmcaBlocks: (blocks) => set({ dmcaBlocks: blocks }),
}));
