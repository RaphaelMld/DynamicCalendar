# Dynamic Calendar - M1 Timetable

A static website that displays your personalized M1 timetable by fetching and filtering events from CalDAV calendars.

## Features

- **Automatic Calendar Fetching**: Pulls events from two CalDAV sources
- **Smart Filtering**: Shows only your UEs and TD groups:
  - DALAS_EN (Groupe 3)
  - MLBDA (Groupe 3) 
  - LRC (Groupe 2)
  - MAPSI (Groupe 1)
  - BIMA (Groupe 3)
- **Interactive Filters**: Filter by UE or group
- **GitHub Pages Ready**: Deploys automatically on push
- **Responsive Design**: Works on desktop and mobile

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the calendar data**:
   ```bash
   npm run build
   ```
   This fetches events from your CalDAV calendars and generates `public/data/events.json`.

3. **Start local server**:
   ```bash
   npm start
   ```
   Open http://localhost:5173 in your browser.

### GitHub Pages Deployment

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Update calendar"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository settings
   - Navigate to "Pages" section
   - Set source to "GitHub Actions"
   - The workflow will automatically build and deploy on every push

3. **Access your site**:
   Your timetable will be available at:
   `https://raphaelmld.github.io/DynamicCalendar/`

## Project Structure

```
├── public/                 # Static files served by GitHub Pages
│   ├── index.html         # Main UI
│   ├── styles.css         # Styling
│   ├── main.js           # Client-side logic
│   └── data/
│       └── events.json    # Generated calendar data
├── scripts/
│   └── build.js          # Build script (fetches & filters calendars)
├── .github/workflows/
│   └── pages.yml         # GitHub Actions deployment
└── package.json          # Dependencies and scripts
```

## Configuration

### Calendar Sources
The build script fetches from these CalDAV collections:
- `https://student.master:guest@cal.ufr-info-p6.jussieu.fr/caldav.php/DAC/M1_DAC`
- `https://student.master:guest@cal.ufr-info-p6.jussieu.fr/caldav.php/IMA/M1_IMA`

### UE Filters
Currently configured for your 5 UEs in `scripts/build.js`:
```javascript
const UE_FILTERS = [
  { code: 'DALAS_EN', group: '3' },
  { code: 'MLBDA', group: '3' },
  { code: 'LRC', group: '2' },
  { code: 'MAPSI', group: '1' },
  { code: 'BIMA', group: '3' }
];
```

## How It Works

1. **Build Process**: The `build.js` script:
   - Fetches ICS data from both CalDAV collections using Basic Auth
   - Parses events and filters by UE codes and groups
   - Generates `public/data/events.json` with filtered events

2. **Frontend**: The UI:
   - Loads events from the generated JSON
   - Provides filters for UE and group
   - Renders events in a responsive grid

3. **Deployment**: GitHub Actions:
   - Runs on every push to `main`
   - Installs dependencies and runs build
   - Deploys the `public/` folder to GitHub Pages

## Customization

### Adding/Removing UEs
Edit the `UE_FILTERS` array in `scripts/build.js`:

```javascript
const UE_FILTERS = [
  { code: 'YOUR_UE', group: 'YOUR_GROUP' },
  // ... other UEs
];
```

### Changing Calendar Sources
Update the `CAL_SOURCES` array in `scripts/build.js`:

```javascript
const CAL_SOURCES = [
  'https://your-calendar-url-1',
  'https://your-calendar-url-2'
];
```

### Styling
Modify `public/styles.css` to change the appearance.

## Troubleshooting

### Build Fails
- Check that CalDAV URLs are accessible
- Verify credentials in the URLs
- Check network connectivity

### No Events Showing
- Run `npm run build` to regenerate data
- Check browser console for errors
- Verify `public/data/events.json` exists and has content

### GitHub Pages Not Updating
- Check Actions tab for failed workflows
- Ensure Pages is set to "GitHub Actions" source
- Verify workflow file is in `.github/workflows/`

## License

MIT
