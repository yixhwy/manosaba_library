(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const MAX_SEARCH_RESULTS = 10000;

  const nav = document.getElementById("chapterNav");
  const sceneTitle = document.getElementById("sceneTitle");
  const sceneMeta = document.getElementById("sceneMeta");
  const lineList = document.getElementById("lineList");
  const searchInput = document.getElementById("searchInput");
  const contentScroll = document.getElementById("contentScroll");
  const scopeBtn = document.getElementById("scopeBtn");
  const scopePanel = document.getElementById("scopePanel");

  const CHARACTER_NAMES = {
    Alisa: "亚里沙",
    AnAn: "安安",
    Coco: "可可",
    Ema: "艾玛",
    Hanna: "汉娜",
    Hiro: "希罗",
    Jailer: "看守",
    Leia: "蕾雅",
    Margo: "玛格",
    Meruru: "梅露露",
    Miria: "米莉亚",
    Nanoka: "奈叶香",
    Noah: "诺亚",
    Sherry: "雪莉",
    Warden: "典狱长",
    Yuki: "雪",
  };

  let data = null;
  let activeSceneId = null;
  let activeAudioButton = null;
  let selectedChapters = new Set();
  let selectedSpeakers = new Set();
  let openGroups = new Set();
  let openChapters = new Set();
  let openBadGroups = new Set();

  const audio = new Audio();
  audio.preload = "none";
  let audioFallbackUsed = false;
  let audioSourcePath = "";

  function audioUrl(relativePath) {
    const base = config.audioBaseUrl.endsWith("/")
      ? config.audioBaseUrl
      : `${config.audioBaseUrl}/`;
    const encoded = relativePath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return base + encoded;
  }

  function localAudioUrl(relativePath) {
    const base = (config.audioLocalFallback || "./audio/").replace(/\/?$/, "/");
    const encoded = relativePath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return base + encoded;
  }

  function setActiveAudio(button, isPlaying) {
    if (!button) return;
    button.classList.toggle("is-playing", Boolean(isPlaying));
    button.setAttribute("aria-pressed", String(Boolean(isPlaying)));
  }

  function clearActiveAudio() {
    if (activeAudioButton) {
      setActiveAudio(activeAudioButton, false);
      activeAudioButton = null;
    }
  }

  function playLine(button) {
    if (!button || !button.dataset.audio) return;

    if (activeAudioButton === button) {
      if (audio.paused) {
        audio.play().catch(() => clearActiveAudio());
        setActiveAudio(button, true);
      } else {
        audio.pause();
      }
      return;
    }

    if (activeAudioButton) {
      setActiveAudio(activeAudioButton, false);
    }

    activeAudioButton = button;
    audioSourcePath = button.dataset.rel || "";
    audioFallbackUsed = false;
    audio.src = button.dataset.audio;
    audio.play().then(() => setActiveAudio(button, true)).catch(() => clearActiveAudio());
  }

  audio.addEventListener("ended", clearActiveAudio);
  audio.addEventListener("pause", () => {
    if (activeAudioButton) setActiveAudio(activeAudioButton, false);
  });
  audio.addEventListener("play", () => {
    if (activeAudioButton) setActiveAudio(activeAudioButton, true);
  });
  audio.addEventListener("error", () => {
    if (!audioFallbackUsed && config.audioLocalFallback && audioSourcePath) {
      audioFallbackUsed = true;
      audio.src = localAudioUrl(audioSourcePath);
      audio.play().catch(() => {
        audioFallbackUsed = false;
        clearActiveAudio();
      });
    } else {
      audioFallbackUsed = false;
      clearActiveAudio();
    }
  });

  function speakerName(speaker) {
    if (!speaker) return "";
    return CHARACTER_NAMES[speaker] || speaker;
  }

  function chapterShortName(chapter) {
    return chapter.label.replace(/^(一周目|二周目|三周目)/, "");
  }

  function chapterCycle(chapter) {
    const match = chapter.label.match(/^(一周目|二周目|三周目)/);
    return match ? match[1] : chapter.label;
  }

  function buildTagGroups() {
    const groups = [];
    for (const cycle of ["一周目", "二周目", "三周目"]) {
      const chapters = data.chapters.filter((chapter) => chapterCycle(chapter) === cycle);
      if (!chapters.length) continue;
      groups.push({
        id: cycle,
        label: cycle,
        type: "chapters",
        items: chapters.map((chapter) => ({
          id: chapter.id,
          label: chapterShortName(chapter),
        })),
      });
    }
    groups.push({
      id: "characters",
      label: "角色",
      type: "characters",
      items: Object.entries(CHARACTER_NAMES).map(([id, label]) => ({ id, label })),
    });
    return groups;
  }

  function findScene(sceneId) {
    for (const chapter of data.chapters) {
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene) return { chapter, scene };
    }
    return null;
  }

  function groupLabel(group) {
    return `${group.adv}（${group.bads.join("、")}）`;
  }

  function createSceneButton(chapter, sceneId) {
    const scene = chapter.scenes.find((item) => item.id === sceneId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-button";
    button.dataset.sceneId = sceneId;
    button.textContent = scene ? scene.label : sceneId;
    button.addEventListener("click", () => selectScene(sceneId));
    return button;
  }

  function sceneIdByLabel(chapter, label) {
    const scene = chapter.scenes.find((item) => item.label === label);
    return scene ? scene.id : null;
  }

  function renderSidebar() {
    const fragment = document.createDocumentFragment();

    for (const chapter of data.chapters) {
      const section = document.createElement("section");
      section.className = "chapter-group";

      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "chapter-toggle";
      heading.textContent = chapter.label;

      const chapterOpen = openChapters.has(chapter.id);
      heading.classList.toggle("is-open", chapterOpen);
      heading.setAttribute("aria-expanded", String(chapterOpen));

      const body = document.createElement("div");
      body.className = "chapter-body";
      body.hidden = !chapterOpen;

      const badGroupByAdv = new Map(
        chapter.badGroups.map((group) => [group.adv, group]),
      );
      const nestedSceneIds = new Set(
        chapter.badGroups.flatMap((group) => [group.adv, ...group.bads]),
      );

      for (const scene of chapter.scenes) {
        const group = badGroupByAdv.get(scene.label);
        if (group) {
          const nested = document.createElement("div");
          nested.className = "bad-group";

          const badKey = `${chapter.id}::${scene.label}`;
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "bad-toggle";
          toggle.textContent = groupLabel(group);

          const badOpen = openBadGroups.has(badKey);
          toggle.classList.toggle("is-open", badOpen);

          const nestedBody = document.createElement("div");
          nestedBody.className = "bad-body";
          nestedBody.hidden = !badOpen;

          toggle.addEventListener("click", () => {
            if (openBadGroups.has(badKey)) openBadGroups.delete(badKey);
            else openBadGroups.add(badKey);
            renderSidebar();
            updateSidebarActive();
          });

          nested.append(toggle, nestedBody);
          for (const label of [group.adv, ...group.bads]) {
            const fullId = sceneIdByLabel(chapter, label);
            if (fullId) nestedBody.append(createSceneButton(chapter, fullId));
          }
          body.append(nested);
          continue;
        }

        if (nestedSceneIds.has(scene.label)) continue;
        body.append(createSceneButton(chapter, scene.id));
      }

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
        updateSidebarActive();
      });

      section.append(heading, body);
      fragment.append(section);
    }

    nav.replaceChildren(fragment);
  }

  function renderScopePanel() {
    scopePanel.replaceChildren();
    const fragment = document.createDocumentFragment();

    for (const group of buildTagGroups()) {
      const section = document.createElement("section");
      section.className = "filter-group";

      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "filter-toggle";
      heading.textContent = group.label;

      const isOpen = openGroups.has(group.id);
      heading.classList.toggle("is-open", isOpen);
      heading.setAttribute("aria-expanded", String(isOpen));

      const body = document.createElement("div");
      body.className = "filter-body";
      body.hidden = !isOpen;

      const selectedSet = group.type === "chapters" ? selectedChapters : selectedSpeakers;

      const selectAll = document.createElement("button");
      selectAll.type = "button";
      selectAll.className = "tag-chip";
      selectAll.textContent = "全选";
      const allSelected = group.items.every((item) => selectedSet.has(item.id));
      if (allSelected) selectAll.classList.add("is-selected");
      selectAll.addEventListener("click", () => {
        if (allSelected) {
          group.items.forEach((item) => selectedSet.delete(item.id));
        } else {
          group.items.forEach((item) => selectedSet.add(item.id));
        }
        renderScopePanel();
        updateScopeLabel();
        renderContent();
      });
      body.append(selectAll);

      for (const item of group.items) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tag-chip";
        chip.textContent = item.label;
        if (selectedSet.has(item.id)) chip.classList.add("is-selected");
        chip.addEventListener("click", () => {
          if (selectedSet.has(item.id)) selectedSet.delete(item.id);
          else selectedSet.add(item.id);
          renderScopePanel();
          updateScopeLabel();
          renderContent();
        });
        body.append(chip);
      }

      heading.addEventListener("click", () => {
        if (openGroups.has(group.id)) openGroups.delete(group.id);
        else openGroups.add(group.id);
        renderScopePanel();
      });

      section.append(heading, body);
      fragment.append(section);
    }

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "clear-scope-btn";
    clearButton.textContent = "清除范围";
    clearButton.addEventListener("click", () => {
      selectedChapters.clear();
      selectedSpeakers.clear();
      renderScopePanel();
      updateScopeLabel();
      renderContent();
    });
    fragment.append(clearButton);

    scopePanel.append(fragment);
  }

  function updateScopeLabel() {
    const labels = [];
    for (const id of selectedChapters) {
      const chapter = data.chapters.find((item) => item.id === id);
      if (chapter) labels.push(chapterShortName(chapter));
    }
    for (const id of selectedSpeakers) labels.push(speakerName(id));
    if (!labels.length) {
      scopeBtn.textContent = "范围：全部";
      return;
    }
    scopeBtn.textContent =
      labels.length <= 3 ? `范围：${labels.join(" / ")}` : `范围：${labels.length} 项`;
  }

  function appendLineText(container, line, prefix) {
    if (prefix) {
      const pre = document.createElement("span");
      pre.textContent = prefix;
      container.append(pre);
    }
    const source = line.markedText || line.text || "";
    const regex = /\[\[link:([^\]]+)\]\]((?:(?!\[\[\/link\]\]).)*)\[\[\/link\]\]/g;
    let last = 0;
    let match;
    while ((match = regex.exec(source)) !== null) {
      if (match.index > last) container.append(source.slice(last, match.index));
      const highlight = document.createElement("span");
      highlight.className = "link-highlight";
      highlight.textContent = `【${match[2]}】`;
      container.append(highlight);
      last = regex.lastIndex;
    }
    if (last < source.length) container.append(source.slice(last));
  }

  function createLineItem(line) {
    const item = document.createElement("li");
    item.className = "line-item";

    if (!line.audio) {
      const readOnly = document.createElement("div");
      readOnly.className = "line read-only";
      if (line.kind === "@choice") readOnly.classList.add("choice-line");

      if (line.speaker) {
        const speaker = document.createElement("span");
        speaker.className = "speaker";
        speaker.textContent = speakerName(line.speaker);
        readOnly.append(speaker);
      }

      const text = document.createElement("span");
      text.className = "text";
      appendLineText(text, line, line.kind === "@choice" ? "【选项】" : null);
      readOnly.append(text);
      item.append(readOnly);
      return item;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "line voiced";
    button.dataset.audio = audioUrl(line.audio);
    button.dataset.rel = line.audio;
    button.setAttribute(
      "aria-label",
      line.speaker ? `播放 ${speakerName(line.speaker)} 的语音` : "播放语音",
    );
    if (line.speaker) {
      const speaker = document.createElement("span");
      speaker.className = "speaker";
      speaker.textContent = speakerName(line.speaker);
      button.append(speaker);
    }
    const buttonText = document.createElement("span");
    buttonText.className = "text";
    appendLineText(buttonText, line, null);
    button.append(buttonText);
    const indicator = document.createElement("span");
    indicator.className = "play-indicator";
    indicator.setAttribute("aria-hidden", "true");
    button.append(indicator);
    button.addEventListener("click", () => playLine(button));
    item.append(button);
    return item;
  }

  function lineMatchesScope(chapter, line) {
    const keyword = searchInput.value.trim().toLowerCase();
    const scopeActive = selectedChapters.size > 0 || selectedSpeakers.size > 0;

    if (scopeActive) {
      if (selectedSpeakers.size > 0) {
        if (!line.speaker || !selectedSpeakers.has(line.speaker)) return false;
      }
      if (selectedChapters.size > 0) {
        if (!selectedChapters.has(chapter.id)) return false;
      }
    }

    if (keyword) {
      const speakerText = speakerName(line.speaker).toLowerCase();
      const text = (line.text || "").toLowerCase();
      if (!speakerText.includes(keyword) && !text.includes(keyword)) return false;
    }
    return true;
  }

  function scopeDescription() {
    const parts = [];
    const chapterLabels = [...selectedChapters]
      .map((id) => {
        const chapter = data.chapters.find((item) => item.id === id);
        return chapter ? chapter.label : "";
      })
      .filter(Boolean);
    const speakerLabels = [...selectedSpeakers].map(speakerName);
    if (chapterLabels.length) parts.push(chapterLabels.join("、"));
    if (speakerLabels.length) parts.push(speakerLabels.join("、"));
    return parts.length ? `范围：${parts.join(" / ")}` : "";
  }

  function renderScene(scene) {
    activeSceneId = scene.id;
    const result = findScene(scene.id);
    sceneTitle.textContent = result
      ? `${result.chapter.label} · ${scene.label}`
      : scene.label;
    sceneMeta.textContent = `${scene.lines.length} 条台词 · ${
      scene.lines.filter((line) => line.audio).length
    } 条有语音`;

    lineList.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const line of scene.lines) {
      fragment.append(createLineItem(line));
    }
    if (!scene.lines.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "该场景没有台词";
      fragment.append(empty);
    }
    lineList.append(fragment);
    updateSidebarActive();
    if (contentScroll) contentScroll.scrollTop = 0;
  }

  function selectScene(sceneId) {
    const result = findScene(sceneId);
    if (!result) return;
    selectedChapters.clear();
    selectedSpeakers.clear();
    searchInput.value = "";
    renderSidebar();
    renderScopePanel();
    updateScopeLabel();
    renderScene(result.scene);
  }

  function updateSidebarActive() {
    nav.querySelectorAll("[data-scene-id]").forEach((button) => {
      const isActive = button.dataset.sceneId === activeSceneId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    });
  }

  function renderContent() {
    const keyword = searchInput.value.trim();
    const scopeActive = selectedChapters.size > 0 || selectedSpeakers.size > 0;

    if (!scopeActive && !keyword) {
      if (activeSceneId) {
        const result = findScene(activeSceneId);
        if (result) {
          renderScene(result.scene);
          return;
        }
      }
      sceneTitle.textContent = "台词预览";
      sceneMeta.textContent = "从左侧选择场景，或在顶部设置范围与搜索词";
      lineList.replaceChildren();
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "选择场景后显示该场景台词；设置范围后显示范围内台词。";
      lineList.append(empty);
      if (contentScroll) contentScroll.scrollTop = 0;
      return;
    }

    const fragment = document.createDocumentFragment();
    let matched = 0;
    let truncated = false;

    for (const chapter of data.chapters) {
      for (const scene of chapter.scenes) {
        let sceneStarted = false;
        let sceneFragment = null;
        for (const line of scene.lines) {
          if (!lineMatchesScope(chapter, line)) continue;
          if (matched >= MAX_SEARCH_RESULTS) {
            truncated = true;
            break;
          }
          if (!sceneStarted) {
            sceneStarted = true;
            sceneFragment = document.createDocumentFragment();
            const heading = document.createElement("li");
            heading.className = "search-group-heading";
            heading.textContent = `${chapter.label} · ${scene.label}`;
            sceneFragment.append(heading);
          }
          sceneFragment.append(createLineItem(line));
          matched += 1;
        }
        if (sceneStarted) fragment.append(sceneFragment);
        if (truncated) break;
      }
      if (truncated) break;
    }

    lineList.replaceChildren(fragment);
    const scopeText = scopeDescription();
    sceneTitle.textContent = keyword
      ? `搜索“${keyword}”${scopeText ? ` · ${scopeText}` : ""}`
      : scopeText;
    sceneMeta.textContent = truncated
      ? `已显示前 ${MAX_SEARCH_RESULTS} 条`
      : `共 ${matched} 条`;
    if (!matched) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "没有找到匹配的台词";
      lineList.append(empty);
    }
    if (contentScroll) contentScroll.scrollTop = 0;
  }

  searchInput.addEventListener("input", () => {
    activeSceneId = null;
    renderContent();
  });

  scopeBtn.addEventListener("click", () => {
    const willOpen = scopePanel.hidden;
    scopePanel.hidden = !willOpen;
    scopeBtn.classList.toggle("is-open", willOpen);
  });

  document.addEventListener("pointerdown", (event) => {
    const area = document.getElementById("searchArea");
    if (area && !area.contains(event.target)) {
      scopePanel.hidden = true;
      scopeBtn.classList.remove("is-open");
    }
  });

  async function init() {
    try {
      const response = await fetch(config.dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();

      if (!data.chapters || !data.chapters.length || !data.chapters[0].scenes.length) {
        throw new Error("数据中没有可展示的场景");
      }

      renderSidebar();
      renderScopePanel();
      renderContent();
    } catch (error) {
      sceneTitle.textContent = "加载失败";
      sceneMeta.textContent = error.message;
      lineList.replaceChildren();
      const item = document.createElement("li");
      item.className = "empty-state";
      item.textContent = "无法加载台词数据，请通过本地服务器打开此页面。";
      lineList.append(item);
    }
  }

  init();
})();
