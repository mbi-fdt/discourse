"use strict";

const express = require("express");
const bent = require("bent");
const getJSON = bent("json");
const { encode } = require("html-entities");
const cleanBaseURL = require("clean-base-url");
const path = require("path");
const { promises: fs } = require("fs");

// via https://stackoverflow.com/a/6248722/165668
function generateUID() {
  let firstPart = (Math.random() * 46656) | 0; // eslint-disable-line no-bitwise
  let secondPart = (Math.random() * 46656) | 0; // eslint-disable-line no-bitwise
  firstPart = ("000" + firstPart.toString(36)).slice(-3);
  secondPart = ("000" + secondPart.toString(36)).slice(-3);
  return firstPart + secondPart;
}

function htmlTag(buffer, bootstrap) {
  let classList = "";
  if (bootstrap.html_classes) {
    classList = ` class="${bootstrap.html_classes}"`;
  }
  buffer.push(`<html lang="${bootstrap.html_lang}"${classList}>`);
}

function head(buffer, bootstrap, headers, baseURL) {
  if (bootstrap.csrf_token) {
    buffer.push(`<meta name="csrf-param" content="authenticity_token">`);
    buffer.push(`<meta name="csrf-token" content="${bootstrap.csrf_token}">`);
  }

  if (bootstrap.theme_id) {
    buffer.push(
      `<meta name="discourse_theme_id" content="${bootstrap.theme_id}">`
    );
  }

  if (bootstrap.theme_color) {
    buffer.push(`<meta name="theme-color" content="${bootstrap.theme_color}">`);
  }

  if (bootstrap.authentication_data) {
    buffer.push(
      `<meta id="data-authentication" data-authentication-data="${encode(
        bootstrap.authentication_data
      )}">`
    );
  }

  let setupData = "";
  Object.keys(bootstrap.setup_data).forEach((sd) => {
    let val = bootstrap.setup_data[sd];
    if (val) {
      if (Array.isArray(val)) {
        val = JSON.stringify(val);
      } else {
        val = val.toString();
      }
      setupData += ` data-${sd.replace(/\_/g, "-")}="${encode(val)}"`;
    }
  });
  buffer.push(`<meta id="data-discourse-setup"${setupData} />`);

  (bootstrap.stylesheets || []).forEach((s) => {
    let attrs = [];
    if (s.media) {
      attrs.push(`media="${s.media}"`);
    }
    if (s.target) {
      attrs.push(`data-target="${s.target}"`);
    }
    if (s.theme_id) {
      attrs.push(`data-theme-id="${s.theme_id}"`);
    }
    if (s.class) {
      attrs.push(`class="${s.class}"`);
    }
    let link = `<link rel="stylesheet" type="text/css" href="${
      s.href
    }" ${attrs.join(" ")}>`;
    buffer.push(link);
  });

  if (bootstrap.preloaded.currentUser) {
    let staff = JSON.parse(bootstrap.preloaded.currentUser).staff;
    if (staff) {
      buffer.push(`<script src="${baseURL}assets/admin.js"></script>`);
    }
  }

  bootstrap.plugin_js.forEach((src) =>
    buffer.push(`<script src="${src}"></script>`)
  );

  buffer.push(bootstrap.theme_html.translations);
  buffer.push(bootstrap.theme_html.js);
  buffer.push(bootstrap.theme_html.head_tag);
  buffer.push(bootstrap.html.before_head_close);
}

function localeScript(buffer, bootstrap) {
  buffer.push(`<script src="${bootstrap.locale_script}"></script>`);
}

function beforeScriptLoad(buffer, bootstrap) {
  buffer.push(bootstrap.html.before_script_load);
  localeScript(buffer, bootstrap);
  (bootstrap.extra_locales || []).forEach((l) =>
    buffer.push(`<script src="${l}"></script>`)
  );
}

function body(buffer, bootstrap) {
  buffer.push(bootstrap.theme_html.header);
  buffer.push(bootstrap.html.header);
}

function bodyFooter(buffer, bootstrap, headers) {
  buffer.push(bootstrap.theme_html.body_tag);
  buffer.push(bootstrap.html.before_body_close);

  let v = generateUID();
  buffer.push(`
		<script async type="text/javascript" id="mini-profiler" src="/mini-profiler-resources/includes.js?v=${v}" data-css-url="/mini-profiler-resources/includes.css?v=${v}" data-version="${v}" data-path="/mini-profiler-resources/" data-horizontal-position="left" data-vertical-position="top" data-trivial="false" data-children="false" data-max-traces="20" data-controls="false" data-total-sql-count="false" data-authorized="true" data-toggle-shortcut="alt+p" data-start-hidden="false" data-collapse-results="true" data-html-container="body" data-hidden-custom-fields="x" data-ids="${headers["x-miniprofiler-ids"]}"></script>
	`);
}

function hiddenLoginForm(buffer, bootstrap) {
  if (!bootstrap.preloaded.currentUser) {
    buffer.push(`
      <form id='hidden-login-form' method="post" action="${bootstrap.login_path}" style="display: none;">
        <input name="username" type="text"     id="signin_username">
        <input name="password" type="password" id="signin_password">
        <input name="redirect" type="hidden">
        <input type="submit" id="signin-button">
      </form>
    `);
  }
}

function preloaded(buffer, bootstrap) {
  buffer.push(
    `<div class="hidden" id="data-preloaded" data-preloaded="${encode(
      JSON.stringify(bootstrap.preloaded)
    )}"></div>`
  );
}

const BUILDERS = {
  "html-tag": htmlTag,
  "before-script-load": beforeScriptLoad,
  head,
  body,
  "hidden-login-form": hiddenLoginForm,
  preloaded,
  "body-footer": bodyFooter,
  "locale-script": localeScript,
};

function replaceIn(bootstrap, template, id, headers, baseURL) {
  let buffer = [];
  BUILDERS[id](buffer, bootstrap, headers, baseURL);
  let contents = buffer.filter((b) => b && b.length > 0).join("\n");

  return template.replace(`<bootstrap-content key="${id}">`, contents);
}

async function applyBootstrap(bootstrap, template, response, baseURL) {
  // If our initial page added some preload data let's not lose that.
  let json = await response.json();
  if (json && json.preloaded) {
    bootstrap.preloaded = Object.assign(json.preloaded, bootstrap.preloaded);
  }

  Object.keys(BUILDERS).forEach((id) => {
    template = replaceIn(bootstrap, template, id, response, baseURL);
  });
  return template;
}

async function buildFromBootstrap(proxy, baseURL, req, response) {
  try {
    const template = await fs.readFile(
      path.join(process.cwd(), "dist", "index.html"),
      "utf8"
    );

    let url = `${proxy}${baseURL}bootstrap.json`;
    const queryLoc = req.url.indexOf("?");
    if (queryLoc !== -1) {
      url += req.url.substr(queryLoc);
    }

    const json = await getJSON(url, null, req.headers);

    return applyBootstrap(json.bootstrap, template, response, baseURL);
  } catch (error) {
    throw new Error(
      `Could not get ${proxy}${baseURL}bootstrap.json\n\n${error}`
    );
  }
}

async function handleRequest(proxy, baseURL, req, res) {
  const originalHost = req.headers.host;
  req.headers.host = new URL(proxy).host;

  if (req.headers["Origin"]) {
    req.headers["Origin"] = req.headers["Origin"]
      .replace(req.headers.host, originalHost)
      .replace(/^https/, "http");
  }

  if (req.headers["Referer"]) {
    req.headers["Referer"] = req.headers["Referer"]
      .replace(req.headers.host, originalHost)
      .replace(/^https/, "http");
  }

  let url = `${proxy}${req.path}`;
  const queryLoc = req.url.indexOf("?");
  if (queryLoc !== -1) {
    url += req.url.substr(queryLoc);
  }

  if (req.method === "GET") {
    req.headers["X-Discourse-Ember-CLI"] = "true";
    req.headers["X-Discourse-Asset-Path"] = req.path;
  }

  const acceptedStatusCodes = [
    200,
    201,
    301,
    302,
    303,
    307,
    308,
    404,
    403,
    500,
  ];
  const proxyRequest = bent(req.method, acceptedStatusCodes);
  const requestBody = req.method === "GET" ? null : req.body;
  const response = await proxyRequest(url, requestBody, req.headers);

  res.set(response.headers);
  res.set("content-encoding", null);

  const { location } = response.headers;
  if (location) {
    const newLocation = location.replace(proxy, `http://${originalHost}`);
    res.set("location", newLocation);
  }

  const csp = response.headers["content-security-policy"];
  if (csp) {
    const newCSP = csp.replace(
      new RegExp(proxy, "g"),
      `http://${originalHost}`
    );
    res.set("content-security-policy", newCSP);
  }

  if (response.headers["x-discourse-bootstrap-required"] === "true") {
    const html = await buildFromBootstrap(proxy, baseURL, req, response);
    res.set("content-type", "text/html");
    res.send(html);
  } else {
    res.status(response.status);
    res.send(await response.text());
  }
}

module.exports = {
  name: require("./package").name,

  isDevelopingAddon() {
    return true;
  },

  serverMiddleware(config) {
    const app = config.app;
    let { proxy, rootURL, baseURL } = config.options;

    if (!proxy) {
      // eslint-disable-next-line no-console
      console.error(`
Discourse can't be run without a \`--proxy\` setting, because it needs a Rails application
to serve API requests. For example:

  yarn run ember serve --proxy "http://localhost:3000"\n`);
      throw "--proxy argument is required";
    }

    baseURL = rootURL === "" ? "/" : cleanBaseURL(rootURL || baseURL);

    const rawMiddleware = express.raw({ type: () => true, limit: "100mb" });

    app.use(rawMiddleware, async (req, res, next) => {
      try {
        if (this.shouldHandleRequest(req)) {
          await handleRequest(proxy, baseURL, req, res);
        }
      } catch (error) {
        res.send(`
          <html>
            <h1>Discourse Build Error</h1>
            <pre><code>${error}</code></pre>
          </html>
        `);
      } finally {
        if (!res.headersSent) {
          return next();
        }
      }
    });
  },

  shouldHandleRequest(request) {
    if (request.path === "/tests/index.html") {
      return false;
    }

    if (request.get("Accept") && request.get("Accept").includes("text/html")) {
      return true;
    }

    const contentType = request.get("Content-Type");
    if (!contentType) {
      return false;
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/json")
    ) {
      return true;
    }

    return false;
  },
};
