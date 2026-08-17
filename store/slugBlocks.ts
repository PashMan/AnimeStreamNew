import { create } from 'zustand';
import { db } from '../services/db';

interface SlugBlocksState {
  slugBlocks: string[];
  fetchSlugBlocks: () => Promise<void>;
}

export const useSlugBlocks = create<SlugBlocksState>((set) => ({
  slugBlocks: [],
  fetchSlugBlocks: async () => {
    const blocks = await db.getSlugBlocks();
    set({ slugBlocks: blocks });
  },
}));
