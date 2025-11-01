import React from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  Paper,
  Slider,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  SkipNext as SkipNextIcon,
  QueueMusic as QueueIcon,
  VolumeOff as VolumeOffIcon,
  VolumeUp as VolumeUpIcon,
  HowToVote as HowToVoteIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon
} from '@mui/icons-material';

const noop = () => {};

const IconAction = ({
  title,
  icon,
  onClick = noop,
  disabled = false,
  color = 'primary'
}) => (
  <Tooltip title={title} placement="top">
    <span>
      <IconButton
        size="large"
        color={disabled ? 'default' : color}
        disabled={disabled}
        onClick={onClick}
        aria-label={title}
        sx={{
          borderRadius: 2,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          boxShadow: disabled ? 'none' : '0 8px 16px rgba(14, 14, 34, 0.15)',
          '&:hover': {
            transform: disabled ? 'none' : 'translateY(-2px)',
            boxShadow: disabled ? 'none' : '0 10px 24px rgba(14, 14, 34, 0.22)'
          }
        }}
      >
        {icon}
      </IconButton>
    </span>
  </Tooltip>
);

export const PlayerControlPanel = ({
  variant = 'panel',
  statusChips = [],
  currentTimeLabel = '0:00',
  durationLabel = '0:00',
  sliderValue = 0,
  sliderMax = 1,
  onSeekChange = noop,
  onSeekCommit = noop,
  seekDisabled = false,
  onPlayNext,
  onPlay,
  onPause,
  onSkip,
  onVote,
  playNextDisabled = false,
  skipDisabled = false,
  voteDisabled = false,
  playDisabled = false,
  pauseDisabled = false,
  volumeValue = 0,
  volumeLabel = 'Muted',
  muted = false,
  onVolumeChange = noop,
  onVolumeToggle = noop,
  volumeDisabled = false,
  children,
  showHeader = true,
  showStatusChips = true,
  headerLabel = 'Player Controls',
  showTimeline = true,
  showVolume = true
}) => {
  const theme = useTheme();
  const isOverlay = variant === 'overlay';
  const shouldRenderHeader = (showHeader || (showStatusChips && statusChips.length > 0));

  const surfaceStyles = isOverlay
    ? {
        backgroundColor: 'rgba(15, 17, 30, 0.82)',
        color: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 20px 40px rgba(8, 10, 22, 0.45)'
      }
    : {
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.background.default, 0.92)} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.14)',
        color: theme.palette.text.primary
      };

  const sliderSx = {
    color: isOverlay ? theme.palette.primary.light : theme.palette.primary.main,
    '& .MuiSlider-thumb': {
      width: 14,
      height: 14
    },
    '& .MuiSlider-rail': {
      opacity: 0.24
    }
  };

  const volumeSliderSx = {
    color: isOverlay ? alpha('#FFFFFF', 0.85) : theme.palette.text.secondary,
    '& .MuiSlider-thumb': {
      width: 14,
      height: 14
    },
    '& .MuiSlider-track': {
      opacity: 0.75
    },
    '& .MuiSlider-rail': {
      opacity: 0.2
    }
  };

  const stackDirection = { xs: 'column', sm: 'row' };
  const stackAlignItems = showVolume
    ? { xs: 'stretch', sm: 'center' }
    : { xs: 'stretch', sm: 'center' };
  const stackJustify = showVolume ? 'space-between' : 'center';

  return (
    <Paper
      elevation={0}
      sx={{
        px: 3,
        py: 3,
        borderRadius: 3,
        ...surfaceStyles
      }}
    >
      <Stack spacing={2.5}>
        {shouldRenderHeader && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
          >
            {showHeader && (
              <Typography variant="subtitle2" sx={{ letterSpacing: 0.4 }}>
                {headerLabel}
              </Typography>
            )}
            {showStatusChips && statusChips.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {statusChips.map(({ label, color = 'default', variant: chipVariant = 'outlined' }, index) => (
                  <Chip key={index} label={label} size="small" color={color} variant={chipVariant} sx={{ fontSize: 11 }} />
                ))}
              </Stack>
            )}
          </Stack>
        )}

        {showTimeline && (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {currentTimeLabel}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {durationLabel}
              </Typography>
            </Stack>
            <Slider
              value={Number.isFinite(sliderValue) ? sliderValue : 0}
              min={0}
              max={sliderMax || 1}
              step={0.1}
              onChange={onSeekChange}
              onChangeCommitted={onSeekCommit}
              disabled={seekDisabled}
              sx={sliderSx}
              aria-label="Playback position"
            />
          </Box>
        )}

        <Stack
          direction={stackDirection}
          spacing={2}
          alignItems={stackAlignItems}
          justifyContent={stackJustify}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            {onPlay && (
              <IconAction
                title="Play"
                icon={<PlayIcon />}
                onClick={onPlay}
                disabled={playDisabled}
                color="success"
              />
            )}
            {onPause && (
              <IconAction
                title="Pause"
                icon={<PauseIcon />}
                onClick={onPause}
                disabled={pauseDisabled}
                color="secondary"
              />
            )}
            {onSkip && (
              <IconAction
                title="Skip without scoring"
                icon={<SkipNextIcon />}
                onClick={onSkip}
                disabled={skipDisabled}
                color="warning"
              />
            )}
            {onVote && (
              <IconAction
                title="Start voting round"
                icon={<HowToVoteIcon />}
                onClick={onVote}
                disabled={voteDisabled}
                color="primary"
              />
            )}
            {onPlayNext && (
              <IconAction
                title="Next from queue"
                icon={<QueueIcon />}
                onClick={onPlayNext}
                disabled={playNextDisabled}
                color="info"
              />
            )}
          </Stack>

          {showVolume && (
            <>
              <Divider
                flexItem
                orientation="vertical"
                sx={{ display: { xs: 'none', sm: 'block' }, opacity: 0.12 }}
              />

              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ flexGrow: { xs: 0, sm: 1 }, minWidth: { xs: '100%', sm: 220 } }}
              >
                <Tooltip title={muted ? 'Unmute' : 'Mute'}>
                  <span>
                    <IconButton
                      size="medium"
                      onClick={onVolumeToggle}
                      disabled={volumeDisabled}
                      sx={{
                        color: muted || volumeValue === 0
                          ? isOverlay
                            ? alpha('#FFFFFF', 0.6)
                            : theme.palette.text.secondary
                          : isOverlay
                            ? theme.palette.primary.light
                            : theme.palette.primary.main
                      }}
                    >
                      {muted || volumeValue === 0 ? <VolumeOffIcon /> : <VolumeUpIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Slider
                  value={Number.isFinite(volumeValue) ? volumeValue : 0}
                  min={0}
                  max={100}
                  step={1}
                  onChange={onVolumeChange}
                  disabled={volumeDisabled}
                  sx={{ flexGrow: 1, ...volumeSliderSx }}
                  aria-label="Volume"
                />
                <Typography variant="caption" sx={{ opacity: 0.7, minWidth: 44, textAlign: 'right' }}>
                  {volumeLabel}
                </Typography>
              </Stack>
            </>
          )}
        </Stack>

        {children && (
          <Box>
            {children}
          </Box>
        )}
      </Stack>
    </Paper>
  );
};

export default PlayerControlPanel;
