import React, { useRef } from 'react';
import _ from 'lodash';
import { nanoid } from 'nanoid/non-secure';
import { clipboard, shell } from 'electron';
import settings from 'electron-settings';
import { ButtonToolbar, Whisper } from 'rsuite';
import { useQuery, useQueryClient } from 'react-query';
import { useParams, useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DownloadButton,
  FavoriteButton,
  PlayAppendButton,
  PlayAppendNextButton,
  PlayButton,
} from '../shared/ToolbarButtons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  appendPlayQueue,
  clearPlayQueue,
  fixPlayer2Index,
  setPlayQueue,
  setPlayQueueByRowClick,
  setRate,
  setStar,
} from '../../redux/playQueueSlice';
import {
  toggleSelected,
  setRangeSelected,
  toggleRangeSelected,
  clearSelected,
} from '../../redux/multiSelectSlice';
import useSearchQuery from '../../hooks/useSearchQuery';
import GenericPage from '../layout/GenericPage';
import ListViewType from '../viewtypes/ListViewType';
import PageLoader from '../loader/PageLoader';
import GenericPageHeader from '../layout/GenericPageHeader';
import { setStatus } from '../../redux/playerSlice';
import { addModalPage } from '../../redux/miscSlice';
import { notifyToast } from '../shared/toast';
import {
  filterPlayQueue,
  formatDate,
  formatDuration,
  getAlbumSize,
  getPlayedSongsNotification,
  isCached,
} from '../../shared/utils';
import {
  LinkWrapper,
  StyledButton,
  StyledLink,
  StyledPopover,
  StyledTagLink,
} from '../shared/styled';
import {
  BlurredBackground,
  BlurredBackgroundWrapper,
  PageHeaderSubtitleDataLine,
} from '../layout/styled';
import { apiController } from '../../api/controller';
import { Artist, Genre, Item, Server } from '../../types';
import { setPlaylistRate } from '../../redux/playlistSlice';
import Card from '../card/Card';
import { setFilter, setPagination } from '../../redux/viewSlice';

interface AlbumParams {
  id: string;
}

const AlbumView = ({ ...rest }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const history = useHistory();
  const queryClient = useQueryClient();
  const artistLineRef = useRef<any>();
  const genreLineRef = useRef<any>();

  const { id } = useParams<AlbumParams>();
  const albumId = rest.id ? rest.id : id;

  const { isLoading, isError, data, error }: any = useQuery(['album', albumId], () =>
    apiController({
      serverType: config.serverType,
      endpoint: 'getAlbum',
      args: { id: albumId },
    })
  );
  const filteredData = useSearchQuery(misc.searchQuery, data?.song, [
    'title',
    'artist',
    'album',
    'year',
    'genre',
    'path',
  ]);

  let timeout: any = null;
  const handleRowClick = (e: any, rowData: any, tableData: any) => {
    if (timeout === null) {
      timeout = window.setTimeout(() => {
        timeout = null;

        if (e.ctrlKey) {
          dispatch(toggleSelected(rowData));
        } else if (e.shiftKey) {
          dispatch(setRangeSelected(rowData));
          dispatch(toggleRangeSelected(tableData));
        }
      }, 100);
    }
  };

  const handleRowDoubleClick = (rowData: any) => {
    window.clearTimeout(timeout);
    timeout = null;

    dispatch(clearSelected());
    dispatch(
      setPlayQueueByRowClick({
        entries: data.song,
        currentIndex: rowData.rowIndex,
        currentSongId: rowData.id,
        uniqueSongId: rowData.uniqueId,
        filters: config.playback.filters,
      })
    );
    dispatch(setStatus('PLAYING'));
    dispatch(fixPlayer2Index());
  };

  const handlePlay = () => {
    const songs = filterPlayQueue(config.playback.filters, data.song);

    if (songs.entries.length > 0) {
      dispatch(setPlayQueue({ entries: songs.entries }));
      dispatch(setStatus('PLAYING'));
      dispatch(fixPlayer2Index());
    } else {
      dispatch(clearPlayQueue());
      dispatch(setStatus('PAUSED'));
    }

    notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'play' }));
  };

  const handlePlayAppend = (type: 'next' | 'later') => {
    const songs = filterPlayQueue(config.playback.filters, data.song);

    if (songs.entries.length > 0) {
      dispatch(appendPlayQueue({ entries: songs.entries, type }));
      dispatch(fixPlayer2Index());
    }

    notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'add' }));
  };

  const handleFavorite = async () => {
    if (!data.starred) {
      await apiController({
        serverType: config.serverType,
        endpoint: 'star',
        args: { id: data.id, type: 'album' },
      });
      queryClient.setQueryData(['album', id], { ...data, starred: Date.now() });
    } else {
      await apiController({
        serverType: config.serverType,
        endpoint: 'unstar',
        args: { id: data.id, type: 'album' },
      });
      queryClient.setQueryData(['album', id], { ...data, starred: undefined });
    }
  };

  const handleRowFavorite = async (rowData: any) => {
    if (!rowData.starred) {
      await apiController({
        serverType: config.serverType,
        endpoint: 'star',
        args: { id: rowData.id, type: 'music' },
      });
      dispatch(setStar({ id: [rowData.id], type: 'star' }));
      queryClient.setQueryData(['album', id], (oldData: any) => {
        const starredIndices = _.keys(_.pickBy(oldData?.song, { id: rowData.id }));
        starredIndices.forEach((index) => {
          oldData.song[index].starred = Date.now();
        });

        return oldData;
      });
    } else {
      await apiController({
        serverType: config.serverType,
        endpoint: 'unstar',
        args: { id: rowData.id, type: 'music' },
      });
      dispatch(setStar({ id: [rowData.id], type: 'unstar' }));
      queryClient.setQueryData(['album', id], (oldData: any) => {
        const starredIndices = _.keys(_.pickBy(oldData?.song, { id: rowData.id }));
        starredIndices.forEach((index) => {
          oldData.song[index].starred = undefined;
        });

        return oldData;
      });
    }
  };

  const handleDownload = async (type: 'copy' | 'download') => {
    if (config.serverType === Server.Jellyfin) {
      const downloadUrls = [];
      for (let i = 0; i < data.song.length; i += 1) {
        downloadUrls.push(
          // eslint-disable-next-line no-await-in-loop
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args: { id: data.song[i].id },
          })
        );
      }

      if (type === 'download') {
        downloadUrls.forEach((url) => shell.openExternal(url));
      } else {
        clipboard.writeText(downloadUrls.join('\n'));
        notifyToast('info', t('Download links copied!'));
      }

      // If not Navidrome (this assumes Airsonic), then we need to use a song's parent
      // to download. This is because Airsonic does not support downloading via album ids
      // that are provided by /getAlbum or /getAlbumList2
    } else if (data.song[0]?.parent) {
      if (type === 'download') {
        shell.openExternal(
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args: { id: data.song[0].parent },
          })
        );
      } else {
        clipboard.writeText(
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args:
              config.serverType === Server.Subsonic ? { id: data.song[0].parent } : { id: data.id },
          })
        );
        notifyToast('info', t('Download links copied!'));
      }
    } else {
      notifyToast('warning', t('No parent album found'));
    }
  };

  const handleRowRating = (rowData: any, e: number) => {
    apiController({
      serverType: config.serverType,
      endpoint: 'setRating',
      args: { ids: [rowData.id], rating: e },
    });
    dispatch(setRate({ id: [rowData.id], rating: e }));
    dispatch(setPlaylistRate({ id: [rowData.id], rating: e }));

    queryClient.setQueryData(['album', albumId], (oldData: any) => {
      const ratedIndices = _.keys(_.pickBy(oldData.song, { id: rowData.id }));
      ratedIndices.forEach((index) => {
        oldData.song[index].userRating = e;
      });

      return oldData;
    });
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (isError) {
    return <span>Error: {error.message}</span>;
  }

  return (
    <>
      {!rest.isModal && (
        <BlurredBackgroundWrapper
          hasImage={!data?.image.match('placeholder')}
          expanded={misc.expandSidebar}
          $titleBar={misc.titleBar} // transient prop to determine margin
        >
          <BlurredBackground
            // We have to use an inline style here due to the context menu forcing a component rerender
            // which causes the background-image to flicker
            expanded={misc.expandSidebar}
            style={{
              backgroundImage: `url(${
                !data?.image.match('placeholder')
                  ? isCached(`${misc.imageCachePath}album_${albumId}.jpg`)
                    ? `${misc.imageCachePath}album_${albumId}.jpg`.replaceAll('\\', '/')
                    : data.image
                  : 'null'
              })`,
            }}
          />
        </BlurredBackgroundWrapper>
      )}

      <GenericPage
        hideDivider
        header={
          <GenericPageHeader
            isDark={!rest.isModal}
            image={
              <Card
                title="None"
                subtitle=""
                coverArt={
                  isCached(`${misc.imageCachePath}album_${albumId}.jpg`)
                    ? `${misc.imageCachePath}album_${albumId}.jpg`
                    : data.image
                }
                size={200}
                hasHoverButtons
                noInfoPanel
                noModalButton
                details={data}
                playClick={{ type: 'album', id: data.id }}
                url={`/library/album/${data.id}`}
                handleFavorite={handleFavorite}
              />
            }
            cacheImages={{
              enabled: settings.getSync('cacheImages'),
              cacheType: 'album',
              id: data.albumId,
            }}
            imageHeight={200}
            title={data.title}
            showTitleTooltip
            subtitle={
              <div>
                <PageHeaderSubtitleDataLine $top $overflow>
                  <StyledLink onClick={() => history.push('/library/album')}>
                    {t('ALBUM')}
                  </StyledLink>{' '}
                  {data.albumArtist && (
                    <>
                      {t('by')}{' '}
                      <LinkWrapper maxWidth="20vw">
                        <StyledLink
                          onClick={() => history.push(`/library/artist/${data.albumArtistId}`)}
                        >
                          <strong>{data.albumArtist}</strong>
                        </StyledLink>
                      </LinkWrapper>
                    </>
                  )}{' '}
                  • {data.songCount} songs, {formatDuration(data.duration)}
                  {data.year && (
                    <>
                      {' • '}
                      {data.year}
                    </>
                  )}
                </PageHeaderSubtitleDataLine>
                <PageHeaderSubtitleDataLine
                  ref={genreLineRef}
                  onWheel={(e: any) => {
                    if (!e.shiftKey) {
                      if (e.deltaY === 0) return;
                      const position = genreLineRef.current.scrollLeft;
                      genreLineRef.current.scrollTo({
                        top: 0,
                        left: position + e.deltaY,
                        behavior: 'smooth',
                      });
                    }
                  }}
                >
                  {t('Added {{val, datetime}}', { val: formatDate(data.created) })}
                  {data.genre.map((d: Genre, i: number) => {
                    return (
                      <span key={nanoid()}>
                        {i === 0 && ' • '}
                        {i > 0 && ', '}
                        <LinkWrapper maxWidth="13vw">
                          <StyledLink
                            tabIndex={0}
                            onClick={() => {
                              if (!rest.isModal) {
                                dispatch(
                                  setFilter({
                                    listType: Item.Album,
                                    data: d.title,
                                  })
                                );
                                dispatch(
                                  setPagination({ listType: Item.Album, data: { activePage: 1 } })
                                );
                                localStorage.setItem('scroll_list_albumList', '0');
                                localStorage.setItem('scroll_grid_albumList', '0');
                                setTimeout(() => {
                                  history.push(`/library/album?sortType=${d.title}`);
                                }, 50);
                              }
                            }}
                            onKeyDown={(e: any) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                if (!rest.isModal) {
                                  dispatch(
                                    setFilter({
                                      listType: Item.Album,
                                      data: d.title,
                                    })
                                  );
                                  dispatch(
                                    setPagination({ listType: Item.Album, data: { activePage: 1 } })
                                  );
                                  localStorage.setItem('scroll_list_albumList', '0');
                                  localStorage.setItem('scroll_grid_albumList', '0');
                                  setTimeout(() => {
                                    history.push(`/library/album?sortType=${d.title}`);
                                  }, 50);
                                }
                              }
                            }}
                          >
                            {d.title}
                          </StyledLink>
                        </LinkWrapper>
                      </span>
                    );
                  })}
                </PageHeaderSubtitleDataLine>
                <PageHeaderSubtitleDataLine
                  ref={artistLineRef}
                  onWheel={(e: any) => {
                    if (!e.shiftKey) {
                      if (e.deltaY === 0) return;
                      const position = artistLineRef.current.scrollLeft;
                      artistLineRef.current.scrollTo({
                        top: 0,
                        left: position + e.deltaY,
                        behavior: 'smooth',
                      });
                    }
                  }}
                >
                  {data.artist ? (
                    data.artist.map((d: Artist) => {
                      return (
                        <StyledTagLink
                          key={nanoid()}
                          tabIndex={0}
                          tooltip={d.title}
                          onClick={() => {
                            if (!rest.isModal) {
                              history.push(`/library/artist/${d.id}`);
                            } else {
                              dispatch(
                                addModalPage({
                                  pageType: 'artist',
                                  id: d.id,
                                })
                              );
                            }
                          }}
                          onKeyDown={(e: any) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              if (!rest.isModal) {
                                history.push(`/library/artist/${d.id}`);
                              } else {
                                dispatch(
                                  addModalPage({
                                    pageType: 'artist',
                                    id: d.id,
                                  })
                                );
                              }
                            }
                          }}
                        >
                          {d.title}
                        </StyledTagLink>
                      );
                    })
                  ) : (
                    <span>&#8203;</span>
                  )}
                </PageHeaderSubtitleDataLine>
                <div style={{ marginTop: '10px' }}>
                  <ButtonToolbar>
                    <PlayButton appearance="primary" size="lg" $circle onClick={handlePlay} />
                    <PlayAppendNextButton
                      appearance="subtle"
                      size="lg"
                      onClick={() => handlePlayAppend('next')}
                    />
                    <PlayAppendButton
                      appearance="subtle"
                      size="lg"
                      onClick={() => handlePlayAppend('later')}
                    />
                    <FavoriteButton
                      size="lg"
                      appearance="subtle"
                      isFavorite={data.starred}
                      onClick={handleFavorite}
                    />
                    <Whisper
                      trigger="hover"
                      placement="bottom"
                      delay={250}
                      enterable
                      preventOverflow
                      speaker={
                        <StyledPopover>
                          <ButtonToolbar>
                            <StyledButton onClick={() => handleDownload('download')}>
                              {t('Download')}
                            </StyledButton>
                            <StyledButton onClick={() => handleDownload('copy')}>
                              {t('Copy to clipboard')}
                            </StyledButton>
                          </ButtonToolbar>
                        </StyledPopover>
                      }
                    >
                      <DownloadButton
                        size="lg"
                        appearance="subtle"
                        downloadSize={getAlbumSize(data.song)}
                      />
                    </Whisper>
                  </ButtonToolbar>
                </div>
              </div>
            }
          />
        }
      >
        <ListViewType
          data={misc.searchQuery !== '' ? filteredData : data.song}
          tableColumns={config.lookAndFeel.listView.music.columns}
          handleRowClick={handleRowClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleRating={handleRowRating}
          virtualized
          rowHeight={Number(settings.getSync('musicListRowHeight'))}
          fontSize={Number(settings.getSync('musicListFontSize'))}
          cacheImages={{
            enabled: settings.getSync('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          page="albumPage"
          listType="music"
          isModal={rest.isModal}
          disabledContextMenuOptions={[
            'removeSelected',
            'moveSelectedTo',
            'deletePlaylist',
            'viewInModal',
          ]}
          handleFavorite={handleRowFavorite}
        />
      </GenericPage>
    </>
  );
};

export default AlbumView;
