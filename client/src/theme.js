import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#9146ff', // Twitch purple
      light: '#a970ff',
      dark: '#772ce8',
    },
    secondary: {
      main: '#00f593', // Accent green
      light: '#33f7a8',
      dark: '#00c474',
    },
    // Bold neon accent palette for immersive visuals
    neon: {
      pink: '#ff1cf7',
      blue: '#00f0ff',
      purple: '#8a2be2',
      magenta: '#ff4dff',
      cyan: '#00e6ff'
    },
    background: {
      default: '#0b0b0d', // Deeper, inky dark
      paper: '#111114',
      elevated: '#16161a',
    },
    text: {
      primary: '#efeff1',
      secondary: '#adadb8',
    },
    error: {
      main: '#ff4444',
    },
    warning: {
      main: '#ffaa00',
    },
    success: {
      main: '#00f593',
    },
    info: {
      main: '#4fc3f7',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
    // Decorative gradients used across the app
    gradients: {
      primary: 'linear-gradient(135deg, #A21CFD 0%, #00F0FF 100%)',
      aurora: 'linear-gradient(135deg, rgba(162,28,253,0.15) 0%, rgba(0,240,255,0.15) 100%)',
      surface: 'radial-gradient(1200px 600px at 80% -20%, rgba(162,28,253,0.15) 0%, rgba(0,0,0,0) 60%), radial-gradient(900px 500px at -10% 120%, rgba(0,240,255,0.12) 0%, rgba(0,0,0,0) 60%)'
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '3.25rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2.25rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: '0.875rem',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 12px rgba(145, 70, 255, 0.3)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': {
            backgroundColor: 'rgba(145, 70, 255, 0.1)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 6,
          fontSize: '0.75rem',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
        },
      },
    },
  },
});

export default theme;
