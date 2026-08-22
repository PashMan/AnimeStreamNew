import { Vote4KSeason, Vote4KSuggestion } from '../types';

export const Vote4KService = {
  async getState(): Promise<Vote4KSeason> {
    const res = await fetch('/api/vote4k', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch 4K vote state: ${res.statusText}`);
    }
    return res.json();
  },

  async suggestAnime(params: {
    animeId: string;
    title: string;
    originalName?: string;
    image: string;
    year?: string | number;
    genres?: string[];
    userEmail: string;
    userName: string;
    userAvatar?: string;
  }): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
    const res = await fetch('/api/vote4k/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return res.json();
  },

  async upvoteSuggestion(
    suggestionId: string,
    userEmail: string
  ): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
    const res = await fetch('/api/vote4k/upvote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId, userEmail })
    });
    return res.json();
  },

  async voteFinal(
    candidateId: string,
    userEmail: string
  ): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
    const res = await fetch('/api/vote4k/vote-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, userEmail })
    });
    return res.json();
  }
};
