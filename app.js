const CONFIG = {
  githubUsername: "Bilalabic",
  githubPagesOrigin: "https://bilalabic.github.io",
  profileRepository: "bilalabic.github.io",
  excludedRepositories: [],
  includeForks: true,
  showArchivedRepositories: true,
  cacheDuration: 30 * 60 * 1000
};

const STORAGE_KEY = "bilalabic-github-hub-cache";

const dom = {
  profileName: document.getElementById("profileName"),
  profileBio: document.getElementById("profileBio"),
  profileLink: document.getElementById("profileLink"),
  liveProjectsList: document.getElementById("liveProjectsList"),
  liveProjectsEmpty: document.getElementById("liveProjectsEmpty"),
  projectsList: document.getElementById("projectsList"),
  projectsEmpty: document.getElementById("projectsEmpty"),
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

function formatYear(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return String(date.getFullYear());
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

function createExternalLink(href, text, className = "") {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (className) {
    link.className = className;
  }
  link.textContent = text;
  return link;
}

function getRepositoryLanguage(repo) {
  return repo?.language || null;
}

function getLiveProjectMetadata(repo) {
  const tags = [];
  const language = getRepositoryLanguage(repo);
  if (language) {
    tags.push(language);
  }
  tags.push("Live");
  if (repo?.archived) {
    tags.push("Archived");
  }
  if (repo?.fork) {
    tags.push("Fork");
  }
  return tags.join(" · ");
}

function createLiveProjectEntry(repo, index) {
  const item = document.createElement("article");
  item.className = "live-item";

  const number = document.createElement("p");
  number.className = "live-index";
  number.textContent = String(index + 1).padStart(2, "0");
  item.appendChild(number);

  const main = document.createElement("div");
  main.className = "live-main";

  const titleRow = document.createElement("div");
  titleRow.className = "live-title-row";

  const title = document.createElement("h3");
  title.className = "live-title";
  title.textContent = repo?.name || "Unnamed project";
  titleRow.appendChild(title);

  const projectUrl = `${CONFIG.githubPagesOrigin}/${encodeURIComponent(repo.name)}/`;
  const visitLink = createExternalLink(projectUrl, "Visit Project ↗", "live-primary-link");
  titleRow.appendChild(visitLink);

  main.appendChild(titleRow);

  const description = document.createElement("p");
  description.className = "live-description";
  description.textContent = repo?.description || "No description provided.";
  main.appendChild(description);

  const metadata = document.createElement("p");
  metadata.className = "live-meta";
  metadata.textContent = getLiveProjectMetadata(repo);
  main.appendChild(metadata);

  const links = document.createElement("div");
  links.className = "live-links";
  links.appendChild(createExternalLink(repo.html_url, "Source ↗"));
  main.appendChild(links);

  item.appendChild(main);
  return item;
}

function createProjectRow(repo) {
  const row = document.createElement("article");
  row.className = "project-row";

  const nameWrap = document.createElement("div");
  const nameLink = createExternalLink(repo.html_url, repo?.name || "Unnamed project", "project-name");
  nameWrap.appendChild(nameLink);

  if (repo?.fork) {
    const forkMark = document.createElement("span");
    forkMark.className = "project-indicator";
    forkMark.textContent = "Fork";
    nameLink.appendChild(forkMark);
  }

  if (repo?.archived) {
    const archivedMark = document.createElement("span");
    archivedMark.className = "project-indicator";
    archivedMark.textContent = "Archived";
    nameLink.appendChild(archivedMark);
  }

  row.appendChild(nameWrap);

  const description = document.createElement("p");
  description.className = "project-description";
  description.textContent = repo?.description || "No description provided.";
  row.appendChild(description);

  const meta = document.createElement("p");
  meta.className = "project-meta";
  const year = formatYear(repo?.updated_at);
  const language = getRepositoryLanguage(repo);
  meta.textContent = language ? `${year} · ${language}` : year;
  row.appendChild(meta);

  return row;
}

function renderProfile(profile) {
  const safeName = profile?.name || "Bilal Abiç";
  const safeBio = profile?.bio || "A collection of public projects, tools and datasets.";
  const safeLink = profile?.html_url || `https://github.com/${encodeURIComponent(CONFIG.githubUsername)}`;

  dom.profileName.textContent = safeName;
  dom.profileBio.textContent = safeBio;
  dom.profileLink.href = safeLink;
}

function renderLiveProjects(repositories) {
  dom.liveProjectsList.textContent = "";

  const liveRepos = sortLiveRepositories(repositories.filter((repo) => repo.has_pages === true));

  if (liveRepos.length === 0) {
    dom.liveProjectsEmpty.hidden = false;
    return;
  }

  dom.liveProjectsEmpty.hidden = true;
  liveRepos.forEach((repo, index) => {
    dom.liveProjectsList.appendChild(createLiveProjectEntry(repo, index));
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
  if (filter === "archived") return repo.archived === true;
  return true;
}

function applyRepositoryFilters() {
  const visible = sortRepositories(state.repositories.filter((repo) => (
    matchesFilter(repo, state.filter) && matchesSearch(repo, state.search)
  )));

  dom.projectsList.textContent = "";

  if (visible.length === 0) {
    dom.projectsEmpty.hidden = false;
    return;
  }

  dom.projectsEmpty.hidden = true;
  visible.forEach((repo) => {
    dom.projectsList.appendChild(createProjectRow(repo));
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
  renderLiveProjects(state.repositories);
  applyRepositoryFilters();
}

async function initializeApp(forceRefresh = false) {
  showStatus("Loading projects...");

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
      showStatus("Profile details are temporarily unavailable. Showing fallback profile text.");
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
    renderLiveProjects([]);
    applyRepositoryFilters();

    const message = deriveErrorMessage(error.type);
    showStatus(message, "error", () => initializeApp(true));
  }
}

bindControls();
initializeApp();
