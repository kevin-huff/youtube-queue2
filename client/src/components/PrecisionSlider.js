import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Slider,
  Stack,
  TextField,
  Button,
} from '@mui/material';

/**
 * High-precision 5-decimal rating slider component
 * Range: 0.00000 - 5.00000
 */
const PrecisionSlider = ({ value, onChange, disabled, min = 0, max = 5, step = 0.00001 }) => {
  const [displayValue, setDisplayValue] = useState(value.toFixed(5));

  useEffect(() => {
    setDisplayValue(value.toFixed(5));
  }, [value]);

  const handleSliderChange = (event, newValue) => {
    onChange(newValue);
  };

  const handleInputChange = (event) => {
    const newValue = event.target.value;
    setDisplayValue(newValue);
  };

  const handleInputBlur = () => {
    const numValue = parseFloat(displayValue);
    if (!isNaN(numValue)) {
      const clamped = Math.max(min, Math.min(max, numValue));
      onChange(clamped);
      setDisplayValue(clamped.toFixed(5));
    } else {
      setDisplayValue(value.toFixed(5));
    }
  };

  // Generate star visualization
  const fullStars = Math.floor(value);
  const partialStar = value - fullStars;
  const emptyStars = max - Math.ceil(value);

  const renderStars = () => {
    const stars = [];
    
    // Full stars
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Box
          key={`full-${i}`}
          component="span"
          sx={{ 
            fontSize: '2rem',
            color: 'warning.main',
          }}
        >
          ★
        </Box>
      );
    }
    
    // Partial star
    if (partialStar > 0) {
      stars.push(
        <Box
          key="partial"
          component="span"
          sx={{ 
            position: 'relative',
            display: 'inline-block',
            fontSize: '2rem',
          }}
        >
          <Box
            component="span"
            sx={{
              color: 'text.disabled',
              position: 'absolute',
            }}
          >
            ★
          </Box>
          <Box
            component="span"
            sx={{
              color: 'warning.main',
              position: 'relative',
              overflow: 'hidden',
              display: 'inline-block',
              width: `${partialStar * 100}%`,
            }}
          >
            ★
          </Box>
        </Box>
      );
    }
    
    // Empty stars
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Box
          key={`empty-${i}`}
          component="span"
          sx={{ 
            fontSize: '2rem',
            color: 'text.disabled',
          }}
        >
          ★
        </Box>
      );
    }
    
    return stars;
  };

  return (
    <Box>
      {/* Star visualization */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        {renderStars()}
      </Box>

      {/* Main score display */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography
          variant="h2"
          sx={{ 
            fontWeight: 700,
            color: disabled ? 'text.disabled' : 'primary.main',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}
        >
          {value.toFixed(5)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          stars (0.00000 - 5.00000)
        </Typography>
      </Box>

      {/* Slider and input controls */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Slider
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          valueLabelDisplay="auto"
          valueLabelFormat={(val) => val.toFixed(5)}
          sx={{
            flex: 1,
            '& .MuiSlider-thumb': {
              width: 28,
              height: 28,
              transition: 'all 0.15s ease-in-out',
              '&:hover, &.Mui-focusVisible': {
                boxShadow: '0 0 0 8px rgba(25, 118, 210, 0.16)',
              },
              '&.Mui-active': {
                boxShadow: '0 0 0 12px rgba(25, 118, 210, 0.24)',
              },
            },
            '& .MuiSlider-track': {
              height: 10,
              borderRadius: 5,
            },
            '& .MuiSlider-rail': {
              height: 10,
              borderRadius: 5,
              opacity: 0.3,
            },
            '& .MuiSlider-valueLabel': {
              fontSize: '0.875rem',
              fontWeight: 600,
              fontFamily: 'monospace',
            },
          }}
        />
        <TextField
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          disabled={disabled}
          type="number"
          inputProps={{
            min,
            max,
            step: 0.00001,
            style: { fontFamily: 'monospace', fontSize: '1.1rem' }
          }}
          sx={{ width: 140 }}
          size="small"
        />
      </Stack>

      {/* Quick set buttons */}
      {!disabled && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="center">
          {[0, 1, 2, 3, 4, 5].map((quickValue) => (
            <Button
              key={quickValue}
              size="small"
              variant={Math.floor(value) === quickValue ? 'contained' : 'outlined'}
              onClick={() => onChange(quickValue)}
              sx={{ minWidth: 45 }}
            >
              {quickValue}
            </Button>
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default PrecisionSlider;
