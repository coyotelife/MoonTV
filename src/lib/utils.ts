/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import Hls from 'hls.js';

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启图片代理，则不使用代理
  const enableImageProxy = localStorage.getItem('enableImageProxy');
  if (enableImageProxy !== null) {
    if (!JSON.parse(enableImageProxy) as boolean) {
      return null;
    }
  }

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return localImageProxy.trim() ? localImageProxy.trim() : null;
  }

  // 如果未设置，则使用全局对象
  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? serverImageProxy.trim()
    : null;
}

/**
 * 修复豆瓣图片 URL：豆瓣近期对海报图强制使用 webp，.jpg 会 403/404
 * 例如：https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2933198755.jpg
 *   -> https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2933198755.webp
 */
export function fixDoubanImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  if (!originalUrl.includes('doubanio.com')) return originalUrl;
  // 将 .jpg/.jpeg/.png 结尾（可能带 query）统一替换为 .webp
  return originalUrl.replace(/\.(jpe?g|png)(\?.*)?$/i, (_m, _ext, query) => {
    return `.webp${query || ''}`;
  });
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const fixedUrl = fixDoubanImageUrl(originalUrl);

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return fixedUrl;

  return `${proxyUrl}${encodeURIComponent(fixedUrl)}`;
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启豆瓣代理，则不使用代理
  const enableDoubanProxy = localStorage.getItem('enableDoubanProxy');
  if (enableDoubanProxy !== null) {
    if (!JSON.parse(enableDoubanProxy) as boolean) {
      return null;
    }
  }

  const localDoubanProxy = localStorage.getItem('doubanProxyUrl');
  if (localDoubanProxy != null) {
    return localDoubanProxy.trim() ? localDoubanProxy.trim() : null;
  }

  // 如果未设置，则使用全局对象
  const serverDoubanProxy = (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY;
  return serverDoubanProxy && serverDoubanProxy.trim()
    ? serverDoubanProxy.trim()
    : null;
}

/**
 * 处理豆瓣 URL，如果设置了豆瓣代理则使用代理
 */
export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\n+|\n+$/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
}> {
  try {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      const pingStart = performance.now();
      let pingTime = 0;
      fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => { pingTime = performance.now() - pingStart; })
        .catch(() => { pingTime = performance.now() - pingStart; });
      const hls = new Hls();
      const timeout = setTimeout(() => {
        hls.destroy();
        video.remove();
        reject(new Error('Timeout loading video metadata'));
      }, 4000);
      video.onerror = () => {
        clearTimeout(timeout);
        hls.destroy();
        video.remove();
        reject(new Error('Failed to load video metadata'));
      };
      let actualLoadSpeed = '未知';
      let hasSpeedCalculated = false;
      let hasMetadataLoaded = false;
      let fragmentStartTime = 0;
      const checkAndResolve = () => {
        if (hasMetadataLoaded && (hasSpeedCalculated || actualLoadSpeed !== '未知')) {
          clearTimeout(timeout);
          const width = video.videoWidth;
          if (width && width > 0) {
            hls.destroy();
            video.remove();
            const quality =
              width >= 3840 ? '4K' : width >= 2560 ? '2K' : width >= 1920 ? '1080p' : width >= 1280 ? '720p' : width >= 854 ? '480p' : 'SD';
            resolve({ quality, loadSpeed: actualLoadSpeed, pingTime: Math.round(pingTime) });
          } else {
            resolve({ quality: '未知', loadSpeed: actualLoadSpeed, pingTime: Math.round(pingTime) });
          }
        }
      };
      hls.on(Hls.Events.FRAG_LOADING, () => { fragmentStartTime = performance.now(); });
      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (fragmentStartTime > 0 && data && data.payload && !hasSpeedCalculated) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;
          if (loadTime > 0 && size > 0) {
            const speedKBps = size / 1024 / (loadTime / 1000);
            const avgSpeedKBps = speedKBps;
            if (avgSpeedKBps >= 1024) { actualLoadSpeed = `${(avgSpeedKBps / 1024).toFixed(1)} MB/s`; } else { actualLoadSpeed = `${avgSpeedKBps.toFixed(1)} KB/s`; }
            hasSpeedCalculated = true;
            checkAndResolve();
          }
        }
      });
      hls.loadSource(m3u8Url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.error('HLS错误:', data);
        if (data.fatal) { clearTimeout(timeout); hls.destroy(); video.remove(); reject(new Error(`HLS播放失败: ${data.type}`)); }
      });
      video.onloadedmetadata = () => { hasMetadataLoaded = true; checkAndResolve(); };
    });
  } catch (error) {
    throw new Error(`Error getting video resolution: ${error instanceof Error ? error.message : String(error)}`);
  }
}
