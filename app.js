const CONFIG = {
  githubUsername: "Bilalabic",
  githubPagesOrigin: "https://bilalabic.github.io",
  profileRepository: "bilalabic.github.io",
  excludedRepositories: [],
  includeForks: true,
  showArchivedRepositories: true,
  maxTopicsPerCard: 3,
  cacheDuration: 30 * 60 * 1000
};

const STORAGE_KEY = "bilalabic-github-hub-cache";

const dom = {
  profileAvatar: document.getElementById("profileAvatar"),
  profileName: document.getElementById("profileName"),
  profileHandle: document.getElementById("profileHandle"),
  profileBio: document.getElementById("profileBio"),
  profileRepoCount: document.getElementById("profileRepoCount"),
  profileLink: document.getElementById("profileLink"),
  liveSitesGrid: document.getElementById("liveSitesGrid"),
  liveSitesEmpty: document.getElementById("liveSitesEmpty"),
  repositoriesGrid: document.getElementById("repositoriesGrid"),
  repositoriesEmpty: document.getElementById("repositoriesEmpty"),
  repositorySearch: document.getElementById("repositorySearch"),
  filterButtons: Array.from(document.querySelectorAll(".filter-button")),
  statusRegion: document.getElementById("statusRegion")
};

const state = {
  repositories: [],
  filter: "all",
  search: ""
};

function normalizeName(value) {
  return String(value || "").toLowerCase();
}

function isExcludedRepository(repoName) {
  const normalized = normalizeName(repoName);
  if (normalized === normalizeName(CONFIG.profileRepository)) {
    return true;
  }

  return CONFIG.excludedRepositories.some((name) => normalizeName(name) === normalized);
}

function safeStorage(action) {
  try {
    return action(window.localStorage);
  } catch {
    return null;
  }
}

function getCachedData() {
  const raw = safeStorage((storage) => storage.getItem(STORAGE_KEY));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const validRepos = Array.isArray(parsed?.repositories);
    if (!validRepos || typeof parsed?.timestamp !== "number") {
      return null;
    }

    return {
      profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
      repositories: parsed.repositories,
      timestamp: parsed.timestamp
    };
  } catch {
    return null;
  }
}

function setCachedData(data) {
  safeStorage((storage) => {
    const payload = JSON.stringify({
      profile: data.profile || null,
      repositories: data.repositories,
      timestamp: Date.now()
    });
    storage.setItem(STORAGE_KEY, payload);
  });
}

function isCacheValid(cache) {
  return Date.now() - cache.timestamp < CONFIG.cacheDuration;
}

function parseGitHubError(response) {
  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      return "rate_limit";
    }
  }

  if (!navigator.onLine) {
    return "offline";
  }

  return "request_failed";
}

async function fetchGitHubProfile() {
  const url = `https://api.github.com/users/${encodeURIComponent(CONFIG.githubUsername)}`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    const error = new Error("Profile request failed");
    error.type = parseGitHubError(response);
    throw error;
  }

  const data = await response.json();
  if (!data || typeof data !== "object") {
    const error = new Error("Malformed profile data");
    error.type = "malformed_data";
    throw error;
  }

  return data;
}

function hasNextPage(linkHeader) {
  if (!linkHeader) {
    return false;
  }

  return linkHeader
    .split(",")
    .map((part) => part.trim())
    .some((part) => /rel="next"$/i.test(part));
}

async function fetchAllRepositories() {
  const repositories = [];
  let page = 1;
  let nextPage = true;

  while (nextPage) {
    const url = new URL(`https://api.github.com/users/${encodeURIComponent(CONFIG.githubUsername)}/repos`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("sort", "updated");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      const error = new Error("Repositories request failed");
      error.type = parseGitHubError(response);
      throw error;
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      const error = new Error("Malformed repositories data");
      error.type = "malformed_data";
      throw error;
    }

    repositories.push(...data);
    nextPage = hasNextPage(response.headers.get("link"));
    page += 1;
  }

  return repositories;
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "Updated unknown";
  }

  return `Updated ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date)}`;
}

function getFilteredRepositories(repositories) {
  const excluded = repositories.filter((repo) => !isExcludedRepository(repo?.name));

  return excluded.filter((repo) => {
    if (!CONFIG.includeForks && repo?.fork) {
      return false;
    }

    if (!CONFIG.showArchivedRepositories && repo?.archived) {
      return false;
    }

    return true;
  });
}

function sortLiveRepositories(repositories) {
  return [...repositories].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function sortRepositories(repositories) {
  return [...repositories].sort((a, b) => {
    if (Boolean(a.archived) !== Boolean(b.archived)) {
      return a.archived ? 1 : -1;
    }

    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

function createBadge(text, className = "") {
  const badge = document.createElement("span");
  badge.className = className ? `badge ${className}` : "badge";
  badge.textContent = text;
  return badge;
}

function createExternalLink(href, text, primary = false) {
  const link = document.createElement("a");
  link.className = primary ? "link-button primary" : "link-button";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  return link;
}

function createRepositoryCard(repo, options = { includeSiteLink: false }) {
  const card = document.createElement("article");
  card.className = "card";

  const titleWrap = document.createElement("div");
  titleWrap.className = "card-title-wrap";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = repo.name || "Unnamed repository";
  titleWrap.appendChild(title);

  const badges = document.createElement("div");
  badges.className = "badges";
  if (repo.fork) {
    badges.appendChild(createBadge("Fork"));
  }
  if (repo.archived) {
    badges.appendChild(createBadge("Archived", "archived"));
  }
  titleWrap.appendChild(badges);
  card.appendChild(titleWrap);

  const description = document.createElement("p");
  description.className = "card-description";
  description.textContent = repo.description || "No description provided.";
  card.appendChild(description);

  const language = repo.language || "Unknown";
  const stars = Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0;
  const forks = Number.isFinite(repo.forks_count) ? repo.forks_count : 0;

  const metadata = document.createElement("p");
  metadata.className = "metadata";
  metadata.textContent = `${language} · ★ ${stars} · Forks ${forks} · ${formatDate(repo.updated_at)}`;
  card.appendChild(metadata);

  const topics = Array.isArray(repo.topics) ? repo.topics.slice(0, CONFIG.maxTopicsPerCard) : [];
  if (topics.length > 0) {
    const topicWrap = document.createElement("div");
    topicWrap.className = "topics";
    topics.forEach((topic) => {
      const topicTag = document.createElement("span");
      topicTag.className = "topic";
      topicTag.textContent = topic;
      topicWrap.appendChild(topicTag);
    });
    card.appendChild(topicWrap);
  }

  const links = document.createElement("div");
  links.className = "card-links";

  if (options.includeSiteLink && repo.has_pages) {
    const siteUrl = `${CONFIG.githubPagesOrigin}/${encodeURIComponent(repo.name)}/`;
    links.appendChild(createExternalLink(siteUrl, "Open Site ↗", true));
  }

  if (!options.includeSiteLink && repo.has_pages) {
    const siteUrl = `${CONFIG.githubPagesOrigin}/${encodeURIComponent(repo.name)}/`;
    links.appendChild(createExternalLink(siteUrl, "Live Site ↗", false));
  }

  links.appendChild(createExternalLink(repo.html_url, "GitHub ↗", !options.includeSiteLink));
  card.appendChild(links);

  return card;
}

function renderProfile(profile) {
  const fallbackName = CONFIG.githubUsername;
  const fallbackBio = "Open-source projects and live GitHub Pages sites.";
  const safeName = profile?.name || fallbackName;
  const safeLogin = profile?.login || CONFIG.githubUsername;
  const safeBio = profile?.bio || fallbackBio;
  const safeAvatar = profile?.avatar_url || `https://github.com/${encodeURIComponent(CONFIG.githubUsername)}.png`;
  const safeLink = profile?.html_url || `https://github.com/${encodeURIComponent(CONFIG.githubUsername)}`;
  const repoCount = Number.isFinite(profile?.public_repos) ? profile.public_repos : state.repositories.length;

  dom.profileAvatar.src = safeAvatar;
  dom.profileAvatar.alt = `${safeLogin} profile avatar`;
  dom.profileName.textContent = safeName;
  dom.profileHandle.textContent = `@${safeLogin}`;
  dom.profileBio.textContent = safeBio;
  dom.profileRepoCount.textContent = `${repoCount} public repositories`;
  dom.profileLink.href = safeLink;
}

function renderLiveSites(repositories) {
  dom.liveSitesGrid.textContent = "";

  const liveRepos = sortLiveRepositories(repositories.filter((repo) => repo.has_pages === true));

  if (liveRepos.length === 0) {
    dom.liveSitesEmpty.hidden = false;
    return;
  }

  dom.liveSitesEmpty.hidden = true;

  liveRepos.forEach((repo) => {
    dom.liveSitesGrid.appendChild(createRepositoryCard(repo, { includeSiteLink: true }));
  });
}

function matchesSearch(repo, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const textParts = [
    repo.name,
    repo.description,
    repo.language,
    ...(Array.isArray(repo.topics) ? repo.topics : [])
  ]
    .filter(Boolean)
    .map((part) => String(part).toLowerCase());

  return textParts.some((part) => part.includes(q));
}

function matchesFilter(repo, filter) {
  if (filter === "live") return repo.has_pages === true;
  if (filter === "original") return repo.fork === false;
  if (filter === "forks") return repo.fork === true;
  if (filter === "archived") return repo.archived === true;
  return true;
}

function applyRepositoryFilters() {
  const visible = sortRepositories(state.repositories.filter((repo) => (
    matchesFilter(repo, state.filter) && matchesSearch(repo, state.search)
  )));

  dom.repositoriesGrid.textContent = "";

  if (visible.length === 0) {
    dom.repositoriesEmpty.hidden = false;
    return;
  }

  dom.repositoriesEmpty.hidden = true;
  visible.forEach((repo) => {
    dom.repositoriesGrid.appendChild(createRepositoryCard(repo, { includeSiteLink: false }));
  });
}

function setFilter(nextFilter) {
  state.filter = nextFilter;
  dom.filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === nextFilter);
  });
  applyRepositoryFilters();
}

function showStatus(message, type = "info", retryHandler = null) {
  dom.statusRegion.className = type === "error" ? "status error" : "status";
  dom.statusRegion.textContent = "";

  if (!message) {
    return;
  }

  const content = document.createElement("div");
  content.className = "status-content";

  const text = document.createElement("span");
  text.textContent = message;
  content.appendChild(text);

  if (typeof retryHandler === "function") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "retry-button";
    retry.textContent = "Retry";
    retry.addEventListener("click", retryHandler);
    content.appendChild(retry);
  }

  dom.statusRegion.appendChild(content);
}

function deriveErrorMessage(errorType) {
  if (errorType === "rate_limit") {
    return "GitHub data is temporarily unavailable due to an API rate limit.";
  }

  if (errorType === "offline") {
    return "You appear to be offline. Check your network connection and retry.";
  }

  if (errorType === "malformed_data") {
    return "GitHub returned unexpected data. Please retry.";
  }

  return "GitHub data could not be loaded right now.";
}

async function loadFromGitHub() {
  const [profileResult, repositoriesResult] = await Promise.allSettled([
    fetchGitHubProfile(),
    fetchAllRepositories()
  ]);

  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const profileErrorType = profileResult.status === "rejected" ? profileResult.reason?.type : null;

  if (repositoriesResult.status !== "fulfilled") {
    const error = new Error("Failed to load repositories");
    error.type = repositoriesResult.reason?.type || "request_failed";
    error.profile = profile;
    error.profileErrorType = profileErrorType;
    throw error;
  }

  return {
    profile,
    profileErrorType,
    repositories: repositoriesResult.value
  };
}

function bindControls() {
  dom.repositorySearch.addEventListener("input", (event) => {
    state.search = event.target.value || "";
    applyRepositoryFilters();
  });

  dom.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter || "all");
    });
  });
}

function renderData(profile, repositories) {
  state.repositories = sortRepositories(getFilteredRepositories(repositories));
  renderProfile(profile);
  renderLiveSites(state.repositories);
  applyRepositoryFilters();
}

async function initializeApp(forceRefresh = false) {
  showStatus("Loading GitHub projects...");

  const cache = getCachedData();
  if (!forceRefresh && cache && isCacheValid(cache)) {
    renderData(cache.profile, cache.repositories);
    showStatus("");
    return;
  }

  try {
    const freshData = await loadFromGitHub();
    renderData(freshData.profile, freshData.repositories);
    setCachedData({ profile: freshData.profile, repositories: freshData.repositories });

    if (freshData.profileErrorType) {
      showStatus("Profile details are temporarily unavailable. Showing fallback profile data.");
    } else {
      showStatus("");
    }
  } catch (error) {
    if (cache) {
      renderData(cache.profile, cache.repositories);
      showStatus("Showing cached data while GitHub is temporarily unavailable.");
      return;
    }

    renderProfile(null);
    state.repositories = [];
    renderLiveSites([]);
    applyRepositoryFilters();

    const message = deriveErrorMessage(error.type);
    showStatus(message, "error", () => initializeApp(true));
  }
}

bindControls();
initializeApp();
