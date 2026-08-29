(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const MAX_RESULTS = 200;
  const BATCH_SIZE = 40;
  const SEARCH_DELAY = 180;
  const nav = document.getElementById("chapterNav");
  const sceneTitle = document.getElementById("sceneTitle");
  const sceneMeta = document.getElementById("sceneMeta");
  const lineList = document.getElementById("lineList");
  const searchInput = document.getElementById("searchInput");
  const contentScroll = document.getElementById("contentScroll");
  const scopeBtn = document.getElementById("scopeBtn");
  const scopePanel = document.getElementById("scopePanel");  const ONLINE_SPEAKERS = new Set([
    "Alisa", "AnAn", "Coco", "Ema", "Hanna", "Hiro", "Jailer", "Leia",
    "Margo", "Meruru", "Miria", "Nanoka", "Noah", "Sherry", "Warden", "Yuki",
  ]);
  const CHARACTER_NAMES = {
    Alisa: "亚里沙", AnAn: "安安", BigWitch: "大魔女", Coco: "可可", Ema: "艾玛",
    EmaFake: "假艾玛", Girl: "女孩", Hanna: "汉娜",
    Hiro: "希罗", Jailer: "看守", Leia: "蕾雅", Margo: "玛格", Meruru: "梅露露",
    Miria: "米莉亚", Nanoka: "奈叶香", Noah: "诺亚", Sherry: "雪莉",
    Rabbit: "兔子", StrayNarehate: "残骸", Unknown: "未知", Warden: "典狱长",
    WitchCandidate1: "参与者1", WitchCandidate2: "参与者2", WitchCandidate3: "参与者3",
    WicthCandidate1: "参与者1", WicthCandidate2: "参与者2", WicthCandidate3: "参与者3", Yuki: "雪",
  };
  let catalog = null;

  let searchEntries = null;
  let activeSceneId = null;
  let selectedChapters = new Set();
  let selectedSpeakers = new Set();
  let openGroups = new Set();
  let openChapters = new Set();
  let openBadGroups = new Set();
  let chapterRequests = new Map();
  let renderId = 0;
  let searchTimer = 0;
  let lastSearchEntries = [];
  let visibleSearchCount = 0;
  const audio = new Audio();
  audio.preload = "none";
  let activeAudioButton = null;


  const textName = (speaker) => CHARACTER_NAMES[speaker] || speaker || "";
  const shortChapter = (chapter) => chapter.label.replace(/^(一周目|二周目|三周目)/, "");
  const cycleOf = (chapter) => (chapter.label.match(/^(一周目|二周目|三周目)/) || [chapter.label])[0];
  const chapterById = (id) => catalog.chapters.find((chapter) => chapter.id === id);
  const encodedPath = (value) => value.split("/").map(encodeURIComponent).join("/");

  function dataUrl(base, value) {
    const root = (base || "./").replace(/\/?$/, "/");
    return root + encodedPath(value);
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }


  async function loadChapter(id) {
    if (chapterRequests.has(id)) return chapterRequests.get(id);
    const request = fetchJson(dataUrl(config.chapterBaseUrl || "./data/chapters/", `${id}.json`));
    chapterRequests.set(id, request);
    return request;
  }

  async function loadSearchIndex() {
    if (searchEntries) return searchEntries;
    const payload = await fetchJson(config.searchIndexUrl || "./data/search-index.json");
    searchEntries = Array.isArray(payload) ? payload : payload.entries;
    if (!Array.isArray(searchEntries)) throw new Error("搜索索引格式无效");
    return searchEntries;
  }

  function audioUrl(relativePath) {
    return dataUrl(config.audioBaseUrl || "/audio/", relativePath);
  }

  function setPlaying(button, playing) {
    if (!button) return;
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    const baseLabel = button.dataset.baseAriaLabel || button.getAttribute("aria-label") || "播放语音";
    button.dataset.baseAriaLabel = baseLabel.replace(/^播放中：|^播放：/, "");
    button.setAttribute("aria-label", playing ? `播放中：${button.dataset.baseAriaLabel}` : button.dataset.baseAriaLabel);
  }

  function playLine(button) {
    if (activeAudioButton === button) return;
    stopAudio();
    activeAudioButton = button;

    setPlaying(button, true);
    audio.src = button.dataset.audio;
    audio.load();
    const playRequest = audio.play();
    if (playRequest && typeof playRequest.catch === "function") {
      playRequest.catch(() => {
        if (activeAudioButton === button) stopAudio();
      });
    }
  }

  function stopAudio() {
    audio.pause();
    if (activeAudioButton) setPlaying(activeAudioButton, false);
    activeAudioButton = null;
  }

  audio.addEventListener("ended", stopAudio);
  audio.addEventListener("play", () => setPlaying(activeAudioButton, true));
  audio.addEventListener("error", stopAudio);

  function appendText(container, line, prefix) {
    if (prefix) container.append(document.createTextNode(prefix));
    const source = line.markedText || line.text || "";
    const regex = /\[\[link:([^\]]+)\]\]((?:(?!\[\[\/link\]\]).)*)\[\[\/link\]\]/g;
    let last = 0;
    let match;
    while ((match = regex.exec(source))) {
      if (match.index > last) container.append(document.createTextNode(source.slice(last, match.index)));
      const link = document.createElement("span");
      link.className = "link-highlight";
      link.textContent = `【${match[2]}】`;
      container.append(link);
      last = regex.lastIndex;
    }
    if (last < source.length) container.append(document.createTextNode(source.slice(last)));
  }

  function createLine(line) {
    const item = document.createElement("li");
    item.className = "line-item";
    const content = document.createElement(line.audio ? "button" : "div");
    content.className = line.audio ? "line voiced" : "line read-only";
    if (line.audio) {
      content.type = "button";
      content.dataset.audio = audioUrl(line.audio);

      content.setAttribute("aria-label", line.speaker ? `播放 ${textName(line.speaker)} 的语音` : "播放语音");
      content.dataset.baseAriaLabel = content.getAttribute("aria-label");
      content.setAttribute("aria-pressed", "false");
      content.addEventListener("click", () => playLine(content));
    }
    if (line.speaker) {
      const speaker = document.createElement("span");
      speaker.className = "speaker";
      speaker.textContent = textName(line.speaker);
      content.append(speaker);
    }
    const text = document.createElement("span");
    text.className = "text";
    appendText(text, line, line.kind === "@choice" ? "【选项】" : null);
    content.append(text);
    if (line.audio) {

      const indicator = document.createElement("span");
      indicator.className = "play-indicator";
      indicator.setAttribute("aria-hidden", "true");
      content.append(indicator);
    }
    item.append(content);
    return item;
  }

  function batchAppend(items, token, createItem, onComplete) {
    let index = 0;
    const append = () => {
      if (token !== renderId) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + BATCH_SIZE, items.length);
      for (; index < end; index += 1) {
        fragment.append(createItem ? createItem(items[index]) : items[index]);
      }
      lineList.append(fragment);
      if (index < items.length) requestAnimationFrame(append);
      else if (onComplete) onComplete();
    };
    append();
  }
  function emptyState(text, className = "") {
    const item = document.createElement("li");
    item.className = `empty-state ${className}`.trim();
    item.textContent = text;
    return item;
  }

  function appendChapterScenes(chapter, body) {
    const groups = new Map((chapter.badGroups || []).map((group) => [group.adv, group]));
    const nested = new Set((chapter.badGroups || []).flatMap((group) => [group.adv, ...group.bads]));
    for (const scene of chapter.scenes) {
      const group = groups.get(scene.label);
      if (group) {
        const box = document.createElement("div");
        box.className = "bad-group";
        const key = `${chapter.id}::${scene.label}`;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "bad-toggle";
        toggle.textContent = `${group.adv}（${group.bads.join("、")}）`;
        const badOpened = openBadGroups.has(key);
        toggle.classList.toggle("is-open", badOpened);
        toggle.setAttribute("aria-expanded", String(badOpened));
        const badBody = document.createElement("div");
        badBody.className = "bad-body";
        badBody.hidden = !badOpened;
        toggle.addEventListener("click", () => {
          if (openBadGroups.has(key)) openBadGroups.delete(key); else openBadGroups.add(key);
          renderSidebar();
          updateActive();
        });
        box.append(toggle, badBody);
        for (const label of [group.adv, ...group.bads]) {
          const target = chapter.scenes.find((item) => item.label === label);
          if (target) badBody.append(sceneButton(chapter, target));
        }
        body.append(box);
      } else if (!nested.has(scene.label)) {
        body.append(sceneButton(chapter, scene));
      }
    }
  }

  function renderSidebar() {
    const fragment = document.createDocumentFragment();
    for (const chapter of catalog.chapters) {
      const section = document.createElement("section");
      section.className = "chapter-group";
      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "chapter-toggle";
      heading.textContent = chapter.label;
      const opened = openChapters.has(chapter.id);
      heading.classList.toggle("is-open", opened);
      heading.setAttribute("aria-expanded", String(opened));
      const body = document.createElement("div");
      body.className = "chapter-body";
      body.hidden = !opened;
      if (opened) appendChapterScenes(chapter, body);
      heading.addEventListener("click", () => {
        if (openChapters.has(chapter.id)) {
          openChapters.delete(chapter.id);
          for (const key of [...openBadGroups]) {
            if (key.startsWith(`${chapter.id}::`)) openBadGroups.delete(key);
          }
        } else {
          openChapters.add(chapter.id);
        }
        renderSidebar();
        updateActive();
      });
      section.append(heading, body);
      fragment.append(section);
    }
    nav.replaceChildren(fragment);
  }
  function sceneButton(chapter, scene) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-button";
    button.dataset.sceneId = scene.id;
    button.textContent = scene.label;
    button.addEventListener("click", () => selectScene(chapter.id, scene.id));
    return button;
  }

  function updateActive() {
    nav.querySelectorAll("[data-scene-id]").forEach((button) => {
      const active = button.dataset.sceneId === activeSceneId;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
  }

  function tagGroups() {
    const groups = ["一周目", "二周目", "三周目"].map((cycle) => ({
      id: cycle, label: cycle, type: "chapters",
      items: catalog.chapters.filter((chapter) => cycleOf(chapter) === cycle).map((chapter) => ({ id: chapter.id, label: shortChapter(chapter) })),
    })).filter((group) => group.items.length);
    const speakerIds = (Array.isArray(catalog.speakers) ? catalog.speakers : []).filter((id) => ONLINE_SPEAKERS.has(id));

    groups.push({ id: "characters", label: "角色", type: "characters", items: speakerIds.map((id) => ({ id, label: textName(id) })) });
    return groups;
  }

  function renderScopes() {
    scopePanel.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const group of tagGroups()) {
      const section = document.createElement("section");
      section.className = "filter-group";
      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "filter-toggle";
      heading.textContent = group.label;
      const opened = openGroups.has(group.id);
      heading.classList.toggle("is-open", opened);
      heading.setAttribute("aria-expanded", String(opened));
      const body = document.createElement("div");
      body.className = "filter-body";
      body.hidden = !opened;
      const selected = group.type === "chapters" ? selectedChapters : selectedSpeakers;
      const addChip = (label, id, all) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tag-chip";
        chip.textContent = label;
        if (all ? group.items.every((item) => selected.has(item.id)) : selected.has(id)) chip.classList.add("is-selected");
        chip.addEventListener("click", () => {
          if (all) {
            const every = group.items.every((item) => selected.has(item.id));
            group.items.forEach((item) => every ? selected.delete(item.id) : selected.add(item.id));
          } else if (selected.has(id)) selected.delete(id); else selected.add(id);
          renderScopes();
          updateScopeLabel();
          scheduleRender();
        });
        body.append(chip);
      };
      addChip("全选", "", true);
      group.items.forEach((item) => addChip(item.label, item.id, false));
      heading.addEventListener("click", () => {
        if (openGroups.has(group.id)) openGroups.delete(group.id); else openGroups.add(group.id);
        renderScopes();
      });
      section.append(heading, body);
      fragment.append(section);
    }
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "clear-scope-btn";
    clear.textContent = "清除范围";
    clear.addEventListener("click", () => {
      selectedChapters.clear(); selectedSpeakers.clear(); renderScopes(); updateScopeLabel(); scheduleRender();
    });
    fragment.append(clear);
    scopePanel.append(fragment);
  }

  function updateScopeLabel() {
    const labels = [...selectedChapters].map((id) => chapterById(id)).filter(Boolean).map(shortChapter).concat([...selectedSpeakers].map(textName));
    scopeBtn.textContent = labels.length ? `范围：${labels.length <= 3 ? labels.join(" / ") : `${labels.length} 项`}` : "范围：全部";
  }

  async function selectScene(chapterId, sceneId) {
    stopAudio();
    const token = ++renderId;
    sceneTitle.textContent = "正在加载场景…";
    sceneMeta.textContent = "";
    lineList.replaceChildren(emptyState("请稍候", "loading-state"));
    try {
      const chapter = await loadChapter(chapterId);
      const scene = chapter && chapter.scenes.find((item) => item.id === sceneId);
      if (!scene) throw new Error(`找不到场景：${sceneId}`);
      activeSceneId = sceneId;
      selectedChapters.clear(); selectedSpeakers.clear(); searchInput.value = "";
      renderSidebar(); renderScopes(); updateScopeLabel();
      sceneTitle.textContent = `${chapter.label} · ${scene.label}`;
      sceneMeta.textContent = `${scene.lines.length} 条台词 · ${scene.lines.filter((line) => line.audio).length} 条有语音`;
      lineList.replaceChildren();
      if (scene.lines.length) batchAppend(scene.lines, token, createLine); else lineList.append(emptyState("该场景没有台词"));
      updateActive();
      if (contentScroll) contentScroll.scrollTop = 0;
    } catch (error) {
      renderError(error, () => selectScene(chapterId, sceneId));
    }
  }

  function renderError(error, retry) {
    sceneTitle.textContent = "加载失败";
    sceneMeta.textContent = error && error.message ? error.message : "网络请求失败";
    lineList.replaceChildren();
    const item = emptyState("无法加载台词数据，请检查网络或通过本地服务器打开。", "error-state");
    const button = document.createElement("button");
    button.type = "button"; button.className = "retry-btn"; button.textContent = "重新加载"; button.addEventListener("click", retry);
    item.append(document.createElement("br"), button); lineList.append(item);
  }

  function matches(entry, query) {
    if (selectedChapters.size && !selectedChapters.has(entry.chapterId)) return false;
    if (selectedSpeakers.size && (!entry.speaker || !selectedSpeakers.has(entry.speaker))) return false;
    if (!query) return true;
    const needle = query.toLowerCase();
    return (entry.text || "").toLowerCase().includes(needle) || textName(entry.speaker).toLowerCase().includes(needle) || String(entry.speaker || "").toLowerCase().includes(needle);
  }

  function renderSearchResults(token) {
    const matched = lastSearchEntries.slice(0, visibleSearchCount);
    const items = [];
    let last = "";
    matched.forEach((entry) => {
      const key = `${entry.chapterId}::${entry.sceneId}`;
      if (key !== last) {
        const chapter = chapterById(entry.chapterId);
        const scene = chapter && chapter.scenes.find((item) => item.id === entry.sceneId);
        const heading = document.createElement("li");
        heading.className = "search-group-heading";
        heading.textContent = `${chapter ? chapter.label : entry.chapterId} · ${scene ? scene.label : entry.sceneId}`;
        items.push(heading);
        last = key;
      }
      items.push(createLine(entry));
    });
    lineList.replaceChildren();
    const appendMoreButton = () => {
      if (lastSearchEntries.length <= visibleSearchCount) return;
      const moreItem = document.createElement("li");
      moreItem.className = "search-more";
      const moreButton = document.createElement("button");
      moreButton.type = "button";
      moreButton.className = "retry-btn";
      moreButton.textContent = `加载后续 ${Math.min(MAX_RESULTS, lastSearchEntries.length - visibleSearchCount)} 条`;
      moreButton.addEventListener("click", () => {
        visibleSearchCount = Math.min(visibleSearchCount + MAX_RESULTS, lastSearchEntries.length);
        renderSearchResults(++renderId);
        if (contentScroll) contentScroll.scrollTop = 0;
      });
      moreItem.append(moreButton);
      lineList.append(moreItem);
    };
    if (items.length) batchAppend(items, token, null, appendMoreButton);
    else lineList.append(emptyState("没有找到匹配的台词"));
    sceneMeta.textContent = lastSearchEntries.length > visibleSearchCount
      ? `已显示 ${visibleSearchCount} / 共 ${lastSearchEntries.length} 条`
      : `共 ${lastSearchEntries.length} 条`;
  }
  async function renderSearch() {
    const token = ++renderId;
    const query = searchInput.value.trim();
    const scoped = selectedChapters.size || selectedSpeakers.size;
    if (!query && !scoped) {
      sceneTitle.textContent = "台词预览";
      sceneMeta.textContent = "从左侧选择场景，或在顶部设置范围与搜索词";
      lineList.replaceChildren(emptyState("选择场景后显示该场景台词；设置范围后显示范围内台词。"));
      return;
    }
    sceneTitle.textContent = query ? `搜索“${query}”` : "范围筛选";
    sceneMeta.textContent = "正在查找…";
    lineList.replaceChildren(emptyState("请稍候", "loading-state"));
    try {
      const entries = await loadSearchIndex();
      if (token !== renderId) return;
      lastSearchEntries = entries.filter((entry) => matches(entry, query));
      visibleSearchCount = Math.min(MAX_RESULTS, lastSearchEntries.length);
      renderSearchResults(token);
    } catch (error) {
      renderError(error, renderSearch);
    }
  }
  function scheduleRender() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderSearch, SEARCH_DELAY);
  }

  searchInput.addEventListener("input", () => { activeSceneId = null; scheduleRender(); });
  scopeBtn.addEventListener("click", () => {
    const opened = scopePanel.hidden; scopePanel.hidden = !opened; scopeBtn.classList.toggle("is-open", opened); scopeBtn.setAttribute("aria-expanded", String(opened));
  });
  document.addEventListener("pointerdown", (event) => {
    const area = document.getElementById("searchArea");
    if (area && !area.contains(event.target)) { scopePanel.hidden = true; scopeBtn.classList.remove("is-open"); scopeBtn.setAttribute("aria-expanded", "false"); }
  });

  async function init() {
    try {
      catalog = await fetchJson(config.manifestUrl || "./data/manifest.json");
      if (!catalog || !catalog.chapters || !catalog.chapters.length) throw new Error("数据中没有可展示的章节");
      renderSidebar(); renderScopes(); renderSearch();
    } catch (error) { renderError(error, init); }
  }
  init();
})();
