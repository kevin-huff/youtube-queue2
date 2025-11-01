# Development Server with Nodemon

## Quick Start

The server is now configured with **nodemon** for automatic restarts when code changes are detected.

### Start the Development Server

```bash
cd server
npm run dev
```

Or use the helper script:
```bash
cd server
./dev-server.sh
```

### Features

- **Auto-restart**: Server automatically restarts when you save changes to files in the `src/` directory
- **Watch**: Monitors `.js` and `.json` files
- **Delay**: 1 second delay before restart to batch rapid changes
- **Ignores**: Test files, node_modules, and logs

### Configuration

Nodemon configuration is in `server/nodemon.json`. You can customize:
- Which directories to watch
- File extensions to monitor  
- Restart delay
- Environment variables

### Manual Restart

While the dev server is running, you can manually restart by typing `rs` and pressing Enter in the terminal.

### Stopping the Server

Press `Ctrl+C` to stop the development server.

## Production

For production, use:
```bash
npm run start:production
```

This runs without nodemon for better performance and stability.
