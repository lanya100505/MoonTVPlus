/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type LibrarySourceType = 'openlist' | 'emby' | `emby:${string}` | `emby_${string}`;

interface EmbySourceOption {
  key: string;
  name: string;
}

interface Video {
  id: string;
  folder?: string;
  tmdbId?: number;
  title: string;
  poster: string;
  releaseDate?: string;
  year?: string;
  overview?: string;
  voteAverage?: number;
  rating?: number;
  mediaType: 'movie' | 'tv';
}

interface EmbyView {
  id: string;
  name: string;
  type: string;
}

export default function PrivateLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 获取运行时配置
  const runtimeConfig = useMemo(() => {
    if (typeof window !== 'undefined' && (window as any).RUNTIME_CONFIG) {
      return (window as any).RUNTIME_CONFIG;
    }
    return { OPENLIST_ENABLED: false, EMBY_ENABLED: false };
  }, []);

  // 解析URL中的source参数（支持 emby:emby1 格式）
  const parseSourceParam = (sourceParam: string | null): { sourceType: LibrarySourceType; embyKey?: string } => {
    if (!sourceParam) return { sourceType: 'openlist' };

    if (sourceParam.includes(':')) {
      const [type, key] = sourceParam.split(':');
      return { sourceType: type as LibrarySourceType, embyKey: key };
    }

    return { sourceType: sourceParam as LibrarySourceType };
  };

  const [sourceType, setSourceType] = useState<LibrarySourceType>('openlist');
  const [embyKey, setEmbyKey] = useState<string | undefined>();
  const [embySourceOptions, setEmbySourceOptions] = useState<EmbySourceOption[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [embyViews, setEmbyViews] = useState<EmbyView[]>([]);
  const [selectedView, setSelectedView] = useState<string>('all');
  const [loadingViews, setLoadingViews] = useState(false);
  const pageSize = 20;
  const observerTarget = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const embyScrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const isInitializedRef = useRef(false);

  // 从URL初始化状态，并检查配置自动跳转
  useEffect(() => {
    const urlSourceParam = searchParams.get('source');
    const urlView = searchParams.get('view');

    // 解析source参数
    const parsed = parseSourceParam(urlSourceParam);

    // 如果 OpenList 未配置但 Emby 已配置，强制使用 Emby
    if (!runtimeConfig.OPENLIST_ENABLED && runtimeConfig.EMBY_ENABLED) {
      setSourceType('emby');
    } else if (parsed.sourceType) {
      setSourceType(parsed.sourceType);
      if (parsed.embyKey) {
        setEmbyKey(parsed.embyKey);
      }
    }

    if (urlView) {
      setSelectedView(urlView);
    }

    isInitializedRef.current = true;
  }, [searchParams, runtimeConfig]);

  // 获取Emby源列表
  useEffect(() => {
    const fetchEmbySources = async () => {
      try {
        const response = await fetch('/api/emby/sources');
        if (response.ok) {
          const data = await response.json();
          setEmbySourceOptions(data.sources || []);

          // 如果没有设置embyKey，使用第一个源
          if (!embyKey && data.sources && data.sources.length > 0) {
            setEmbyKey(data.sources[0].key);
          }
        }
      } catch (error) {
        console.error('获取Emby源列表失败:', error);
      }
    };

    if (sourceType === 'emby') {
      fetchEmbySources();
    }
  }, [sourceType]);

  // 更新URL参数
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const params = new URLSearchParams();

    // 构建source参数
    if (sourceType === 'emby' && embyKey && embySourceOptions.length > 1) {
      params.set('source', `emby:${embyKey}`);
    } else {
      params.set('source', sourceType);
    }

    if (sourceType === 'emby' && selectedView !== 'all') {
      params.set('view', selectedView);
    }

    router.replace(`/private-library?${params.toString()}`, { scroll: false });
  }, [sourceType, embyKey, selectedView, router, embySourceOptions.length]);

  // 切换源类型时重置所有状态（但不在初始化时执行）
  useEffect(() => {
    if (!isInitializedRef.current) return;

    setPage(1);
    setVideos([]);
    setHasMore(true);
    setError('');
    setSelectedView('all');
    isFetchingRef.current = false;
  }, [sourceType, embyKey]);

  // 切换分类时重置状态（但不在初始化时执行）
  useEffect(() => {
    if (!isInitializedRef.current) return;

    setPage(1);
    setVideos([]);
    setHasMore(true);
    setError('');
    isFetchingRef.current = false;
  }, [selectedView]);

  // 获取 Emby 媒体库列表
  useEffect(() => {
    if (sourceType !== 'emby' || !embyKey) return;

    const fetchEmbyViews = async () => {
      setLoadingViews(true);
      try {
        const params = new URLSearchParams({ embyKey });
        const response = await fetch(`/api/emby/views?${params.toString()}`);
        const data = await response.json();

        if (data.error) {
          console.error('获取 Emby 媒体库列表失败:', data.error);
          setEmbyViews([]);
        } else {
          setEmbyViews(data.views || []);

          // 分类加载完成后，检查URL中是否有view参数
          const urlView = searchParams.get('view');
          if (urlView && data.views && data.views.length > 0) {
            // 检查该view是否存在于分类列表中
            const viewExists = data.views.some((v: EmbyView) => v.id === urlView);
            if (viewExists) {
              setSelectedView(urlView);
            }
          }
        }
      } catch (err) {
        console.error('获取 Emby 媒体库列表失败:', err);
        setEmbyViews([]);
      } finally {
        setLoadingViews(false);
      }
    };

    fetchEmbyViews();
  }, [sourceType, embyKey, searchParams]);

  // 鼠标拖动滚动
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
    scrollContainerRef.current.style.cursor = 'grabbing';
    scrollContainerRef.current.style.userSelect = 'none';
  };

  const handleMouseLeave = () => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = 'auto';
  };

  const handleMouseUp = () => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = 'auto';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 2; // 滚动速度倍数
    scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  // 加载数据的函数
  useEffect(() => {
    const fetchVideos = async () => {
      const isInitial = page === 1;

      // 防止重复请求
      if (isFetchingRef.current) {
        return;
      }

      // 如果选择了 openlist 但未配置，不发起请求
      if (sourceType === 'openlist' && !runtimeConfig.OPENLIST_ENABLED) {
        setLoading(false);
        return;
      }

      // 如果选择了 emby 但未配置或没有embyKey，不发起请求
      if (sourceType === 'emby' && (!runtimeConfig.EMBY_ENABLED || !embyKey)) {
        setLoading(false);
        return;
      }

      isFetchingRef.current = true;

      try {
        if (isInitial) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError('');

        const endpoint = sourceType === 'openlist'
          ? `/api/openlist/list?page=${page}&pageSize=${pageSize}`
          : `/api/emby/list?page=${page}&pageSize=${pageSize}${selectedView !== 'all' ? `&parentId=${selectedView}` : ''}&embyKey=${embyKey}`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          throw new Error('获取视频列表失败');
        }

        const data = await response.json();

        if (data.error) {
          setError(data.error);
          if (isInitial) {
            setVideos([]);
          }
        } else {
          const newVideos = data.list || [];

          if (isInitial) {
            setVideos(newVideos);
          } else {
            setVideos((prev) => [...prev, ...newVideos]);
          }

          // 检查是否还有更多数据
          const currentPage = data.page || page;
          const totalPages = data.totalPages || 1;
          const hasMoreData = currentPage < totalPages;
          setHasMore(hasMoreData);
        }
      } catch (err) {
        console.error('获取视频列表失败:', err);
        setError('获取视频列表失败');
        if (isInitial) {
          setVideos([]);
        }
      } finally {
        if (isInitial) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
        isFetchingRef.current = false;
      }
    };

    fetchVideos();
  }, [sourceType, embyKey, page, selectedView, runtimeConfig]);

  const handleVideoClick = (video: Video) => {
    // 构建source参数
    let sourceParam = sourceType;
    if (sourceType === 'emby' && embyKey && embySourceOptions.length > 1) {
      sourceParam = `emby:${embyKey}`;
    }

    // 跳转到播放页面
    router.push(`/play?source=${sourceParam}&id=${encodeURIComponent(video.id)}`);
  };

  // 使用 Intersection Observer 监听滚动
  useEffect(() => {
    if (!observerTarget.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        // 当目标元素可见且还有更多数据且没有正在加载时，加载下一页
        if (entry.isIntersecting && hasMore && !loadingMore && !loading && !isFetchingRef.current) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentTarget = observerTarget.current;
    observer.observe(currentTarget);

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading, page]);

  return (
    <PageLayout activePath='/private-library'>
      <div className='container mx-auto px-4 py-6'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
            私人影库
          </h1>
          <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
            观看自我收藏的高清视频吧
          </p>
        </div>

        {/* 第一级：源类型选择（OpenList / Emby） */}
        <div className='mb-6 flex justify-center'>
          <div className='inline-flex gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1'>
            <button
              onClick={() => setSourceType('openlist')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'openlist'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              OpenList
            </button>
            <button
              onClick={() => setSourceType('emby')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sourceType === 'emby'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Emby
            </button>
          </div>
        </div>

        {/* 第二级：Emby源选择（仅当选择Emby且有多个源时显示） */}
        {sourceType === 'emby' && embySourceOptions.length > 1 && (
          <div className='mb-6'>
            <div className='relative'>
              <div
                ref={embyScrollContainerRef}
                className='overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing'
                onMouseDown={(e) => {
                  if (!embyScrollContainerRef.current) return;
                  isDraggingRef.current = true;
                  startXRef.current = e.pageX - embyScrollContainerRef.current.offsetLeft;
                  scrollLeftRef.current = embyScrollContainerRef.current.scrollLeft;
                  embyScrollContainerRef.current.style.cursor = 'grabbing';
                  embyScrollContainerRef.current.style.userSelect = 'none';
                }}
                onMouseLeave={() => {
                  if (!embyScrollContainerRef.current) return;
                  isDraggingRef.current = false;
                  embyScrollContainerRef.current.style.cursor = 'grab';
                  embyScrollContainerRef.current.style.userSelect = 'auto';
                }}
                onMouseUp={() => {
                  if (!embyScrollContainerRef.current) return;
                  isDraggingRef.current = false;
                  embyScrollContainerRef.current.style.cursor = 'grab';
                  embyScrollContainerRef.current.style.userSelect = 'auto';
                }}
                onMouseMove={(e) => {
                  if (!isDraggingRef.current || !embyScrollContainerRef.current) return;
                  e.preventDefault();
                  const x = e.pageX - embyScrollContainerRef.current.offsetLeft;
                  const walk = (x - startXRef.current) * 2;
                  embyScrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
                }}
              >
                <div className='flex gap-2 px-4 min-w-min'>
                  {embySourceOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setEmbyKey(option.key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        embyKey === option.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 第三级：Emby 媒体库分类选择器 */}
        {sourceType === 'emby' && (
          <div className='mb-6'>
            {loadingViews ? (
              <div className='flex justify-center'>
                <div className='w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
              </div>
            ) : embyViews.length > 0 ? (
              <div className='relative'>
                <div
                  ref={scrollContainerRef}
                  className='overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing'
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeave}
                  onMouseUp={handleMouseUp}
                  onMouseMove={handleMouseMove}
                >
                  <div className='flex gap-2 px-4 min-w-min'>
                    <button
                      onClick={() => setSelectedView('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        selectedView === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      全部
                    </button>
                    {embyViews.map((view) => (
                      <button
                        key={view.id}
                        onClick={() => setSelectedView(view.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                          selectedView === view.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {view.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {error && (
          <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6'>
            <p className='text-red-800 dark:text-red-200'>{error}</p>
          </div>
        )}

        {loading ? (
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {Array.from({ length: pageSize }).map((_, index) => (
              <div
                key={index}
                className='animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg aspect-[2/3]'
              />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className='text-center py-12'>
            <p className='text-gray-500 dark:text-gray-400'>
              {sourceType === 'openlist'
                ? '暂无视频，请在管理面板配置 OpenList 并刷新'
                : '暂无视频，请在管理面板配置 Emby'}
            </p>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
              {videos.map((video) => {
                // 构建source参数用于VideoCard
                // 如果是emby源且有embyKey，使用下划线格式
                let sourceParam = sourceType;
                if (sourceType === 'emby' && embyKey) {
                  sourceParam = `emby_${embyKey}`;
                }

                return (
                  <VideoCard
                    key={video.id}
                    id={video.id}
                    source={sourceParam}
                    title={video.title}
                    poster={video.poster}
                    year={video.year || (video.releaseDate ? video.releaseDate.split('-')[0] : '')}
                    rate={
                      video.rating
                        ? video.rating.toFixed(1)
                        : video.voteAverage && video.voteAverage > 0
                        ? video.voteAverage.toFixed(1)
                        : ''
                    }
                    from='search'
                  />
                );
              })}
            </div>

            {/* 滚动加载指示器 - 始终渲染以便 observer 可以监听 */}
            <div ref={observerTarget} className='flex justify-center items-center py-8 min-h-[100px]'>
              {loadingMore && (
                <div className='flex items-center gap-2 text-gray-600 dark:text-gray-400'>
                  <div className='w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
                  <span>加载中...</span>
                </div>
              )}
              {!hasMore && videos.length > 0 && !loadingMore && (
                <div className='text-gray-500 dark:text-gray-400'>
                  已加载全部内容
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
