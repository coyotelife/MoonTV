import { DoubanItem, DoubanResult } from './types';
import { fixDoubanImageUrl, getDoubanProxyUrl } from './utils';

interface DoubanCategoriesParams {
  kind: 'tv' | 'movie';
  category: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

interface DoubanCategoryApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const proxyUrl = getDoubanProxyUrl();
  const finalUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(url)}` : url;
  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      ...options.headers,
    },
  };
  try {
    const response = await fetch(finalUrl, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export function shouldUseDoubanClient(): boolean {
  return getDoubanProxyUrl() !== null;
}

export async function fetchDoubanCategories(
  params: DoubanCategoriesParams
): Promise<DoubanResult> {
  const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;
  if (!['tv', 'movie'].includes(kind)) { throw new Error('kind 参数必须是 tv 或 movie'); }
  if (!category || !type) { throw new Error('category 和 type 参数不能为空'); }
  if (pageLimit < 1 || pageLimit > 100) { throw new Error('pageLimit 必须在 1-100 之间'); }
  if (pageStart < 0) { throw new Error('pageStart 不能小于 0'); }
  const target = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${kind}?start=${pageStart}&limit=${pageLimit}&category=${category}&type=${type}`;
  try {
    const response = await fetchWithTimeout(target);
    if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
    const doubanData: DoubanCategoryApiResponse = await response.json();
    const list: DoubanItem[] = doubanData.items.map((item) => ({
      id: item.id,
      title: item.title,
      poster: fixDoubanImageUrl(item.pic?.normal || item.pic?.large || ''),
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));
    return { code: 200, message: '获取成功', list: list };
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('globalError', { detail: { message: '获取豆瓣分类数据失败' } }));
    }
    throw new Error(`获取豆瓣分类数据失败: ${(error as Error).message}`);
  }
}

export async function getDoubanCategories(
  params: DoubanCategoriesParams
): Promise<DoubanResult> {
  if (shouldUseDoubanClient()) {
    return fetchDoubanCategories(params);
  } else {
    const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;
    const response = await fetch(`/api/douban/categories?kind=${kind}&category=${category}&type=${type}&limit=${pageLimit}&start=${pageStart}`);
    if (!response.ok) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('globalError', { detail: { message: '获取豆瓣分类数据失败' } }));
      }
      throw new Error('获取豆瓣分类数据失败');
    }
    return response.json();
  }
}

interface DoubanListParams {
  tag: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

export async function getDoubanList(
  params: DoubanListParams
): Promise<DoubanResult> {
  const { tag, type, pageLimit = 20, pageStart = 0 } = params;
  if (shouldUseDoubanClient()) {
    return fetchDoubanList(params);
  } else {
    const response = await fetch(`/api/douban?tag=${tag}&type=${type}&pageSize=${pageLimit}&pageStart=${pageStart}`);
    if (!response.ok) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('globalError', { detail: { message: '获取豆瓣列表数据失败' } }));
      }
      throw new Error('获取豆瓣列表数据失败');
    }
    return response.json();
  }
}

export async function fetchDoubanList(
  params: DoubanListParams
): Promise<DoubanResult> {
  const { tag, type, pageLimit = 20, pageStart = 0 } = params;
  if (!tag || !type) { throw new Error('tag 和 type 参数不能为空'); }
  if (!['tv', 'movie'].includes(type)) { throw new Error('type 参数必须是 tv 或 movie'); }
  if (pageLimit < 1 || pageLimit > 100) { throw new Error('pageLimit 必须在 1-100 之间'); }
  if (pageStart < 0) { throw new Error('pageStart 不能小于 0'); }
  const target = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;
  try {
    const response = await fetchWithTimeout(target);
    if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
    const doubanData: DoubanCategoryApiResponse = await response.json();
    const list: DoubanItem[] = doubanData.items.map((item) => ({
      id: item.id,
      title: item.title,
      poster: fixDoubanImageUrl(item.pic?.normal || item.pic?.large || ''),
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));
    return { code: 200, message: '获取成功', list: list };
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('globalError', { detail: { message: '获取豆瓣列表数据失败' } }));
    }
    throw new Error(`获取豆瓣分类数据失败: ${(error as Error).message}`);
  }
}
