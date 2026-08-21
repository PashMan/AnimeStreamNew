// IndexedDB service for offline manga storage

export interface OfflineChapter {
  id: string; // chapterId
  mangaId: string;
  mangaTitle: string;
  mangaCover?: string;
  chapterNumber: string;
  chapterTitle?: string;
  group?: string;
  pages: string[]; // Base64 data URLs for 100% offline access
  downloadedAt: number;
  pagesCount: number;
}

const DB_NAME = 'KamiMangaOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_chapters';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB не поддерживается вашим браузером'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

// Convert image URL to Base64 Data URL for true offline reading
async function imageUrlToDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    // If CORS or network error occurs, return original URL as fallback
    return url;
  }
}

export async function saveChapterOffline(
  manga: { id: string; title: string; image?: string },
  chapter: { id: string; chapter: string; title?: string; group?: string },
  pageUrls: string[],
  onProgress?: (current: number, total: number) => void
): Promise<OfflineChapter> {
  const db = await openDB();

  // Convert each page to Base64
  const offlinePages: string[] = [];
  for (let i = 0; i < pageUrls.length; i++) {
    if (onProgress) onProgress(i + 1, pageUrls.length);
    const dataUrl = await imageUrlToDataUrl(pageUrls[i]);
    offlinePages.push(dataUrl);
  }

  const record: OfflineChapter = {
    id: chapter.id,
    mangaId: manga.id,
    mangaTitle: manga.title,
    mangaCover: manga.image,
    chapterNumber: chapter.chapter,
    chapterTitle: chapter.title,
    group: chapter.group,
    pages: offlinePages,
    downloadedAt: Date.now(),
    pagesCount: offlinePages.length
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);

    req.onsuccess = () => resolve(record);
    req.onerror = (e: any) => reject(e.target.error);
  });
}

export async function getOfflineChapter(chapterId: string): Promise<OfflineChapter | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(chapterId);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function getAllOfflineChapters(): Promise<OfflineChapter[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  const chapter = await getOfflineChapter(chapterId);
  return !!chapter;
}

export async function deleteOfflineChapter(chapterId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(chapterId);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}
