/**
 * Brain Dashboard Plugin — read-only viewer for the GBrain markdown vault.
 *
 * Layout: tree on left, rendered markdown on right.
 * Wikilinks ([[Note Name]]) are clickable and navigate within the viewer.
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const { React } = SDK;
  const { Card, CardHeader, CardTitle, CardContent, Badge } = SDK.components;
  const { useState, useEffect, useMemo, useCallback } = SDK.hooks;
  const { cn } = SDK.utils;

  // ─────────────────────────────────────────────────────────────────────
  // Lazy-load marked from CDN once
  let _markedPromise = null;
  function loadMarked() {
    if (_markedPromise) return _markedPromise;
    _markedPromise = new Promise(function (resolve, reject) {
      if (window.marked) { resolve(window.marked); return; }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/marked@13.0.0/marked.min.js";
      s.onload = function () { resolve(window.marked); };
      s.onerror = function () { reject(new Error("Failed to load marked")); };
      document.head.appendChild(s);
    });
    return _markedPromise;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Wikilink + markdown rendering
  // Replace [[Note]] and [[Note|Alias]] with anchor tags before passing to marked.
  function preprocessWikilinks(md) {
    return md.replace(/\[\[([^\]]+)\]\]/g, function (_, body) {
      const parts = body.split("|");
      const target = parts[0].trim();
      const label = (parts[1] || target).trim();
      const enc = encodeURIComponent(target);
      // Custom protocol so we can intercept clicks
      return '[' + label + '](wikilink:' + enc + ')';
    });
  }

  function renderMarkdown(md, marked) {
    const pre = preprocessWikilinks(md || "");
    return marked.parse(pre, { breaks: false, gfm: true });
  }

  // Strip YAML frontmatter and return {meta: {...}, body: '...'}
  function splitFrontmatter(md) {
    if (!md.startsWith("---\n") && !md.startsWith("---\r\n")) {
      return { meta: null, body: md };
    }
    const end = md.indexOf("\n---", 4);
    if (end < 0) return { meta: null, body: md };
    const yaml = md.slice(4, end);
    const body = md.slice(end + 4).replace(/^\r?\n/, "");
    // Tiny YAML-ish parser: top-level "key: value" + simple lists
    const meta = {};
    let currentKey = null;
    yaml.split(/\r?\n/).forEach(function (line) {
      if (!line.trim() || line.trim().startsWith("#")) return;
      const listMatch = line.match(/^\s+-\s+(.+)$/);
      if (listMatch && currentKey) {
        if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
        meta[currentKey].push(listMatch[1].replace(/^["']|["']$/g, "").trim());
        return;
      }
      const kv = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
      if (kv) {
        currentKey = kv[1];
        const val = kv[2].trim();
        if (val === "" || val === "[]") {
          meta[currentKey] = val === "[]" ? [] : "";
        } else if (val.startsWith("[") && val.endsWith("]")) {
          meta[currentKey] = val.slice(1, -1).split(",").map(function (s) {
            return s.trim().replace(/^["']|["']$/g, "");
          }).filter(Boolean);
        } else {
          meta[currentKey] = val.replace(/^["']|["']$/g, "");
        }
      }
    });
    return { meta: meta, body: body };
  }

  function FrontmatterCard(props) {
    const meta = props.meta;
    const [expanded, setExpanded] = useState(false);
    if (!meta || Object.keys(meta).length === 0) return null;
    const entries = Object.entries(meta);

    // Find tag-like keys (tags, aliases, categories) to surface when collapsed
    const tagKeys = ["tags", "tag", "aliases", "alias", "categories", "category"];
    const tagValues = [];
    tagKeys.forEach(function (k) {
      if (Array.isArray(meta[k])) tagValues.push.apply(tagValues, meta[k]);
      else if (typeof meta[k] === "string" && meta[k]) tagValues.push(meta[k]);
    });

    function chip(text, key) {
      return React.createElement("span", {
        key: key,
        style: {
          display: "inline-block",
          background: "rgba(127,127,127,0.15)",
          padding: "2px 8px",
          borderRadius: "10px",
          marginRight: "6px",
          marginBottom: "4px",
          fontSize: "0.85em",
        },
      }, text);
    }

    const toggleBtn = React.createElement("button", {
      onClick: function () { setExpanded(!expanded); },
      style: {
        background: "transparent",
        border: "none",
        color: "var(--muted-foreground, #888)",
        fontSize: "0.78em",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        cursor: "pointer",
        padding: "0",
        fontFamily: "inherit",
      },
    }, expanded ? "▾ properties" : "▸ properties");

    if (!expanded) {
      // Collapsed: just toggle + tag chips inline
      return React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "16px",
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(127,127,127,0.15)",
        },
      },
        toggleBtn,
        tagValues.length > 0 && React.createElement("div", {
          style: { display: "flex", flexWrap: "wrap", alignItems: "center" },
        }, tagValues.map(function (t, i) { return chip(t, i); })),
      );
    }

    // Expanded: full grid
    return React.createElement("div", {
      style: {
        background: "rgba(127,127,127,0.08)",
        border: "1px solid rgba(127,127,127,0.25)",
        borderRadius: "6px",
        padding: "12px 16px",
        marginBottom: "20px",
        fontSize: "0.88em",
      },
    },
      React.createElement("div", { style: { marginBottom: "10px" } }, toggleBtn),
      React.createElement("div", {
        style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", alignItems: "baseline" },
      },
        entries.map(function (e) {
          const k = e[0], v = e[1];
          return [
            React.createElement("div", {
              key: "k-" + k,
              style: { color: "var(--muted-foreground, #888)", textTransform: "uppercase", fontSize: "0.78em", letterSpacing: "0.04em", fontWeight: 600 },
            }, k),
            React.createElement("div", { key: "v-" + k, style: { color: "inherit" } },
              Array.isArray(v)
                ? v.map(function (item, i) { return chip(item, i); })
                : String(v),
            ),
          ];
        }).flat(),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Tree component
  function TreeNode(props) {
    const { node, currentPath, onSelect, depth } = props;
    const [open, setOpen] = useState(depth < 1); // top level open by default

    if (node.type === "dir") {
      return React.createElement("div", null,
        React.createElement("div", {
          className: "flex items-center gap-1 cursor-pointer hover:bg-foreground/5 px-1 py-0.5 text-sm font-courier",
          style: { paddingLeft: (depth * 12) + "px" },
          onClick: function () { setOpen(!open); },
        },
          React.createElement("span", { className: "text-muted-foreground text-xs w-3" }, open ? "▾" : "▸"),
          React.createElement("span", { className: "text-foreground/80" }, "📁 " + node.name),
        ),
        open && React.createElement("div", null,
          node.children.map(function (child) {
            return React.createElement(TreeNode, {
              key: child.path,
              node: child,
              currentPath: currentPath,
              onSelect: onSelect,
              depth: depth + 1,
            });
          }),
        ),
      );
    }

    const isActive = currentPath === node.path;
    return React.createElement("div", {
      className: cn(
        "cursor-pointer px-1 py-0.5 text-sm font-courier truncate",
        isActive ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5",
      ),
      style: { paddingLeft: ((depth * 12) + 16) + "px" },
      onClick: function () { onSelect(node.path); },
      title: node.path,
    },
      "📄 " + node.name.replace(/\.md$/i, ""),
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Main page
  function BrainPage() {
    const [tree, setTree] = useState(null);
    const [treeError, setTreeError] = useState(null);
    const [currentPath, setCurrentPath] = useState(function () {
      // Read initial path from hash: #path=people/mike-seid.md
      try {
        const m = window.location.hash.match(/[#&]path=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : null;
      } catch (e) { return null; }
    });
    const [fileData, setFileData] = useState(null);
    const [fileError, setFileError] = useState(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [marked, setMarked] = useState(null);

    // Sync hash with currentPath (so refresh + share-by-URL works, and
    // back/forward buttons navigate within the viewer)
    useEffect(function () {
      const expected = currentPath ? "#path=" + encodeURIComponent(currentPath) : "";
      if (window.location.hash !== expected) {
        // pushState so browser back-button works
        try {
          history.pushState(null, "", window.location.pathname + window.location.search + expected);
        } catch (e) {
          window.location.hash = expected.replace(/^#/, "");
        }
      }
    }, [currentPath]);

    // Listen to hash changes (back/forward buttons)
    useEffect(function () {
      function onHashChange() {
        const m = window.location.hash.match(/[#&]path=([^&]+)/);
        const next = m ? decodeURIComponent(m[1]) : null;
        setCurrentPath(function (prev) { return prev === next ? prev : next; });
      }
      window.addEventListener("hashchange", onHashChange);
      window.addEventListener("popstate", onHashChange);
      return function () {
        window.removeEventListener("hashchange", onHashChange);
        window.removeEventListener("popstate", onHashChange);
      };
    }, []);

    // Load tree once
    useEffect(function () {
      SDK.fetchJSON("/api/plugins/brain/tree")
        .then(function (data) { setTree(data); })
        .catch(function (e) { setTreeError(String(e)); });
      loadMarked().then(setMarked).catch(function (e) { console.error(e); });
    }, []);

    // Load file when currentPath changes
    useEffect(function () {
      if (!currentPath) return;
      setFileLoading(true);
      setFileError(null);
      SDK.fetchJSON("/api/plugins/brain/file?path=" + encodeURIComponent(currentPath))
        .then(function (data) { setFileData(data); })
        .catch(function (e) { setFileError(String(e)); setFileData(null); })
        .finally(function () { setFileLoading(false); });
    }, [currentPath]);

    // Handle clicks on rendered links: wikilinks, relative .md links, anchors
    const handleContentClick = useCallback(function (ev) {
      const a = ev.target.closest && ev.target.closest("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";

      // Custom wikilink protocol
      if (href.startsWith("wikilink:")) {
        ev.preventDefault();
        const target = decodeURIComponent(href.slice("wikilink:".length));
        SDK.fetchJSON("/api/plugins/brain/resolve?name=" + encodeURIComponent(target))
          .then(function (data) {
            if (data.matches && data.matches.length > 0) {
              setCurrentPath(data.matches[0]);
            } else {
              setFileError("Note not found: " + target);
            }
          })
          .catch(function () { setFileError("Note not found: " + target); });
        return;
      }

      // In-page anchor (#section) — let the browser scroll
      if (href.startsWith("#") && !href.startsWith("#path=")) return;

      // Absolute http(s) — open external in new tab
      if (/^https?:\/\//i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        return;
      }

      // Relative link to another markdown file or path within vault
      const looksInternal = /\.md(?:#|$)/i.test(href) || (!href.includes("://") && !href.startsWith("mailto:"));
      if (looksInternal) {
        ev.preventDefault();
        // Resolve against currentPath's directory
        let target = href.split("#")[0]; // strip section anchor for now
        if (currentPath && !target.startsWith("/")) {
          const dir = currentPath.includes("/") ? currentPath.replace(/\/[^\/]*$/, "/") : "";
          target = dir + target;
        }
        target = target.replace(/^\.\//, "").replace(/^\//, "");
        // Normalize ../ segments
        const parts = target.split("/");
        const stack = [];
        parts.forEach(function (p) {
          if (p === "..") stack.pop();
          else if (p && p !== ".") stack.push(p);
        });
        target = stack.join("/");
        if (!/\.md$/i.test(target)) target += ".md";

        // Try direct path first; if it 404s, fall back to wikilink-style resolve
        SDK.fetchJSON("/api/plugins/brain/file?path=" + encodeURIComponent(target))
          .then(function () { setCurrentPath(target); })
          .catch(function () {
            const stem = target.split("/").pop().replace(/\.md$/i, "");
            SDK.fetchJSON("/api/plugins/brain/resolve?name=" + encodeURIComponent(stem))
              .then(function (data) {
                if (data.matches && data.matches.length > 0) setCurrentPath(data.matches[0]);
                else setFileError("Link target not found: " + href);
              })
              .catch(function () { setFileError("Link target not found: " + href); });
          });
      }
    }, [currentPath]);

    const split = useMemo(function () {
      if (!fileData) return { meta: null, body: "" };
      return splitFrontmatter(fileData.content);
    }, [fileData]);

    const renderedHtml = useMemo(function () {
      if (!fileData || !marked) return "";
      try { return renderMarkdown(split.body, marked); }
      catch (e) { return "<pre>Render error: " + String(e) + "</pre>"; }
    }, [split, marked]);

    // ───── Layout ─────
    return React.createElement("div", { className: "flex flex-col gap-4" },
      // Header
      React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement(CardTitle, { className: "text-lg" }, "🧠 Brain"),
            React.createElement(Badge, { variant: "outline" }, "read-only"),
            tree && React.createElement("span", {
              className: "text-xs font-courier text-muted-foreground"
            }, tree.root),
          ),
        ),
      ),

      // Two-pane layout
      React.createElement("div", { className: "grid gap-4", style: { gridTemplateColumns: "280px 1fr" } },
        // Left: tree
        React.createElement(Card, { className: "overflow-hidden" },
          React.createElement(CardContent, {
            className: "p-2 overflow-auto",
            style: { maxHeight: "calc(100vh - 240px)", minHeight: "400px" },
          },
            treeError && React.createElement("p", {
              className: "text-sm text-red-500 font-courier p-2"
            }, treeError),
            !tree && !treeError && React.createElement("p", {
              className: "text-sm text-muted-foreground font-courier p-2"
            }, "Loading tree…"),
            tree && tree.tree.map(function (node) {
              return React.createElement(TreeNode, {
                key: node.path,
                node: node,
                currentPath: currentPath,
                onSelect: setCurrentPath,
                depth: 0,
              });
            }),
          ),
        ),

        // Right: rendered markdown
        React.createElement(Card, { className: "overflow-hidden" },
          React.createElement(CardContent, {
            className: "p-6 overflow-auto",
            style: { maxHeight: "calc(100vh - 240px)", minHeight: "400px" },
          },
            !currentPath && React.createElement("p", {
              className: "text-sm text-muted-foreground font-courier"
            }, "Select a note from the tree on the left."),
            fileLoading && React.createElement("p", {
              className: "text-sm text-muted-foreground font-courier"
            }, "Loading…"),
            fileError && React.createElement("p", {
              className: "text-sm text-red-500 font-courier"
            }, fileError),
            fileData && !fileLoading && React.createElement("div", null,
              React.createElement(FrontmatterCard, { meta: split.meta }),
              React.createElement("div", {
                className: "brain-markdown prose prose-sm max-w-none dark:prose-invert",
                onClick: handleContentClick,
                dangerouslySetInnerHTML: { __html: renderedHtml },
              }),
            ),
          ),
        ),
      ),
    );
  }

  // Inject minimal styles for markdown rendering (in case prose plugin isn't loaded)
  if (!document.getElementById("brain-plugin-styles")) {
    const style = document.createElement("style");
    style.id = "brain-plugin-styles";
    style.textContent = `
      .brain-markdown { color: inherit; line-height: 1.6; }
      .brain-markdown h1, .brain-markdown h2, .brain-markdown h3, .brain-markdown h4 {
        font-weight: 600; margin-top: 1.4em; margin-bottom: 0.6em;
      }
      .brain-markdown h1 { font-size: 1.6em; border-bottom: 1px solid var(--border, #444); padding-bottom: 0.3em; }
      .brain-markdown h2 { font-size: 1.3em; }
      .brain-markdown h3 { font-size: 1.1em; }
      .brain-markdown p { margin: 0.6em 0; }
      .brain-markdown ul, .brain-markdown ol { margin: 0.6em 0; padding-left: 1.4em; }
      .brain-markdown li { margin: 0.2em 0; }
      .brain-markdown code { background: rgba(127,127,127,0.15); padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 0.9em; }
      .brain-markdown pre { background: rgba(127,127,127,0.1); padding: 0.8em; border-radius: 4px; overflow-x: auto; }
      .brain-markdown pre code { background: transparent; padding: 0; }
      .brain-markdown blockquote { border-left: 3px solid rgba(127,127,127,0.4); padding-left: 0.8em; margin: 0.6em 0; color: var(--muted-foreground, #888); }
      .brain-markdown a { color: #6aa9ff; text-decoration: underline; cursor: pointer; }
      .brain-markdown a:hover { color: #8cbfff; }
      .brain-markdown table { border-collapse: collapse; margin: 0.8em 0; }
      .brain-markdown th, .brain-markdown td { border: 1px solid rgba(127,127,127,0.3); padding: 0.4em 0.7em; }
      .brain-markdown th { background: rgba(127,127,127,0.1); font-weight: 600; }
      .brain-markdown hr { border: none; border-top: 1px solid rgba(127,127,127,0.3); margin: 1.5em 0; }
    `;
    document.head.appendChild(style);
  }

  // Register
  window.__HERMES_PLUGINS__.register("brain", BrainPage);
})();
