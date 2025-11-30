# Project Interview Coach - Frontend

A React TypeScript application built with Vite for conducting AI-powered project interviews using LiveKit.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Backend server running (see `../backend/`)

### Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:5173
```

## 📁 Project Structure

```
frontend/
├── src/
│   ├── App.tsx          # Main application component
│   ├── App.css          # Application styles
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── package.json         # Dependencies and scripts
├── vite.config.ts       # Vite configuration
└── tsconfig.json        # TypeScript configuration
```

## 🛠️ Available Scripts

### Development
```bash
npm run dev
```
Starts the development server at http://localhost:5173 with hot module replacement.

### Build
```bash
npm run build
```
Creates an optimized production build in the `dist/` directory.

### Preview
```bash
npm run preview
```
Preview the production build locally.

### Lint
```bash
npm run lint
```
Run ESLint to check code quality.

### Test Setup
```bash
node test_frontend_setup.js
```
Run automated verification tests (32 tests).

## 📦 Key Dependencies

### Production
- **React 19.2.0** - UI framework
- **React DOM 19.2.0** - React rendering
- **@livekit/components-react 2.9.16** - LiveKit React components
- **livekit-client 2.16.0** - LiveKit client SDK

### Development
- **Vite 7.2.4** - Build tool and dev server
- **TypeScript 5.9.3** - Type checking
- **ESLint 9.39.1** - Code linting

## 🎨 Current Features (Checkpoint 9)

- ✅ Start screen with "Project Interview Coach" heading
- ✅ "Start Interview" button
- ✅ Modern gradient UI design
- ✅ State management for connection status
- ✅ Responsive layout

## 🔜 Coming Next (Checkpoint 10)

- [ ] Token fetching from backend
- [ ] LiveKit room connection
- [ ] Audio controls
- [ ] Real-time voice interaction

## 🧪 Testing

### Automated Tests
Run the test suite to verify setup:
```bash
node test_frontend_setup.js
```

**Expected Output:**
```
✨ All tests passed! Checkpoint 9 is complete!
Total Tests: 32
Passed: 32
Failed: 0
Success Rate: 100.0%
```

### Manual Testing
1. Start the dev server: `npm run dev`
2. Open http://localhost:5173
3. Verify:
   - "Project Interview Coach" heading is visible
   - "Start Interview" button is visible
   - Button is clickable
   - Clicking shows "Connected to Interview" screen

## 🎯 Development Workflow

### Adding a New Component
1. Create component file in `src/components/`
2. Import and use in `App.tsx`
3. Add styles in component-specific CSS file

### Styling
- Global styles: `src/index.css`
- App styles: `src/App.css`
- Component styles: Create `ComponentName.css`

### TypeScript
- Types are automatically inferred
- Add explicit types for props and state
- Check types with `tsc --noEmit`

## 🔧 Configuration

### Vite (vite.config.ts)
- React plugin configured
- Port: 5173 (default)
- Hot Module Replacement enabled

### TypeScript (tsconfig.json)
- Project references setup
- Strict mode enabled
- Modern ES features supported

### ESLint (eslint.config.js)
- React rules enabled
- TypeScript support
- React hooks rules

## 🌐 Environment Variables

The backend URL is currently hardcoded to `http://localhost:8000`.

To make it configurable, create a `.env` file:
```env
VITE_BACKEND_URL=http://localhost:8000
```

Then use in code:
```typescript
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill the process using port 5173
lsof -ti:5173 | xargs kill -9

# Or specify a different port
npm run dev -- --port 3000
```

### Dependencies Not Installing
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors
```bash
# Check TypeScript version
npm list typescript

# Rebuild TypeScript
npm run build
```

### Vite Build Errors
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

## 📚 Resources

- [Vite Documentation](https://vite.dev)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [LiveKit Docs](https://docs.livekit.io)
- [LiveKit React Components](https://docs.livekit.io/reference/components/react/)

## ✅ Verification

This frontend has been fully tested and verified:
- ✅ All files present and correct
- ✅ All dependencies installed
- ✅ Dev server runs without errors
- ✅ UI displays correctly
- ✅ Button interactions work
- ✅ 32/32 automated tests pass

See `STEP_9_COMPLETE.md` and `CHECKPOINT_9_VERIFICATION.md` in the parent directory for detailed verification reports.

## 📝 License

Part of the Interview Agent project.

## 🤝 Contributing

This is a checkpoint-based project. Current checkpoint: 9 (Frontend Scaffolded) ✅

---

**Status:** Checkpoint 9 Complete ✅  
**Next:** Checkpoint 10 - Frontend Connects  
**Updated:** November 30, 2025
