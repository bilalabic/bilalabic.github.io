# Bilalabic.github.io

An editorial-style project showcase that automatically lists public repositories and live GitHub Pages projects for Bilalabic.

https://bilalabic.github.io/

## Features

- Loads GitHub profile data for Bilalabic
- Lists public repositories directly from the GitHub REST API
- Detects live projects automatically using `repo.has_pages === true`
- Shows dedicated **Live Projects** and **All Projects** sections
- Supports client-side search and lightweight repository filters
- Uses resilient local cache with stale fallback
- Works with system light/dark mode and responsive layouts

## How It Works

- Profile endpoint:
  - `https://api.github.com/users/Bilalabic`
- Repository endpoint:
  - `https://api.github.com/users/Bilalabic/repos?per_page=100&sort=updated&direction=desc`
- Pagination is handled by checking the GitHub `Link` header for `rel="next"`
- Pages-enabled repositories are detected with `repo.has_pages === true`
- Data is cached in `localStorage` for 30 minutes to reduce API calls
- The site repository (`bilalabic.github.io`) is excluded from all listings

## Local Development

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Deployment

- Repository: `Bilalabic/bilalabic.github.io`
- Branch: `main`
- GitHub Pages source: repository root
- Production: `https://bilalabic.github.io/`

## Project Structure

```text
.
├── .nojekyll
├── 404.html
├── README.md
├── app.js
├── index.html
├── robots.txt
├── sitemap.xml
└── style.css
```
