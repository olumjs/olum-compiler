/**
 * @name olum-compiler
 * @copyright 2021
 * @author Eissa Saber
 * @license MIT
 */

const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const WorkboxPlugin = require("workbox-webpack-plugin");
const WebpackPwaManifest = require("webpack-pwa-manifest");
const CopyPlugin = require("copy-webpack-plugin");
const { title, favicon, template, hash, comments, polyfill, assetAsModule, serviceWorker, manifest } = require("../../package.json").olum;
const olumVer = require("olum/package.json").version;
const isObj = obj => !!(obj !== null && typeof obj === "object");
const isFullArr = arr => !!(isObj(arr) && Array.isArray(arr) && arr.length);

function getSelector() {
  return new Promise((resolve, reject) => {
    const commentsRegex = /(\/\*)([\s\S]*?)(\*\/)|(\/\/.*)/gi;
    const olumRegex = /(\/*|\/\/)=?.*(new Olum)[\s\S]*?\.\$\((\'|\")(.*)(\'|\")\)[\s\S]*?(\.use\()/gi;
    const file = path.resolve(__dirname, "./src/index.js");
    if (fs.existsSync(file)) {
      fs.readFile(file, "utf8", (err, data) => {
        if (err) return reject(err);
        data = data.replace(commentsRegex, ""); // clean code from inline/block comments
        const instanceArr = data.match(olumRegex);
        if (isFullArr(instanceArr)) {
          const validOlumInstance = instanceArr.reverse().find(item => !item.trim().startsWith("/"));
          validOlumInstance.replace(olumRegex, ($1, $2, $3, $4, $5, $6) => {
            const selector = $5;
            resolve(selector);
          });
        } else resolve();
      });
    }
  });
}

const initConfig = (env, selector = "{{olumSelector}}") => {
  if (!fs.existsSync(path.resolve(__dirname, "./src/index.js")) || !fs.existsSync(path.resolve(__dirname, "./src/index.scss"))) {
    console.log("Make sure to have index.js & index.scss in src directory instead of app.js & app.scss");
  }

  const mode = !!env.dev ? "development" : "production";
  const globs = [path.resolve(__dirname, "./src/index.scss"), path.resolve(__dirname, "./src/index.js")];
  // add devtool if it exists
  const devtoolExists = fs.existsSync(path.resolve(__dirname, "../olum-devtool"));
  const devtoolStyleExists = fs.existsSync(path.resolve(__dirname, "../olum-devtool/dist/olum-devtool.scss"));
  if (mode === "development" && devtoolExists && devtoolStyleExists) {
    globs.push(path.resolve(__dirname, "../olum-devtool"));
    globs.push(path.resolve(__dirname, "../olum-devtool/dist/olum-devtool.scss"));
  }
  const main = polyfill ? ["babel-polyfill", ...globs] : [...globs];

  const configObj = {
    stats: "errors-warnings",
    mode,
    entry: { main },
    output: {
      path: path.resolve(__dirname, "build"),
      filename: hash ? `app[fullhash:${hash}].js` : `app[fullhash:5].js`,
    },
    plugins: [
      new HtmlWebpackPlugin({ title, template, favicon }),
      new webpack.NormalModuleReplacementPlugin(/.*/g, resource => {
        const contextRegex = /[\/|\\]node_modules[\/|\\]olum-compiler[\/|\\]src/g;
        // if import statement within the file inside src folder has .html extension then replace it with .js
        if (contextRegex.test(resource.context) && resource.request.toLowerCase().endsWith(".html")) {
          resource.request = resource.request.substr(0, resource.request.length - 5) + ".js";
        }
      }),
    ],
    module: {
      rules: [
        {
          test: /\.(?:js|mjs)$/i,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: "babel-loader",
          },
        },
        {
          test: /olum-devtool\.js$/,
          loader: "string-replace-loader",
          options: {
            multiple: [
              {
                search: /\{\{olumSelector\}\}/g,
                replace: selector,
              },
              {
                search: /\{\{olumVer\}\}/g,
                replace: olumVer,
              },
            ],
          },
        },
        {
          test: /\.(?:scss|sass|css)$/i,
          use: ["style-loader", "css-loader", "sass-loader"],
        },
      ],
    },
  };

  // handle assets
  if (assetAsModule) {
    const obj = {
      test: /\.(?:ico|gif|png|jpg|jpeg|svg|webp|tif|tiff|jfif|pjpeg|pjp|apng|avif|bmp|cur|m4awebm|mpg|mp2|mpeg|mpe|mpv|mp4|m4p|m4v|avi|wmv|mov|qt|flv|swf|avchd|wav|mp3|aac|ogg|woff|woff2|ttf|eot)$/i,
      type: "asset/resource",
    };
    configObj.module.rules.push(obj);
  } else {
    configObj.plugins.push(new CopyPlugin({ patterns: [{ from: "./src/assets", to: path.resolve(__dirname, `build/assets`) }] }));
  }

  if (mode === "development") {
    const clean = new CleanWebpackPlugin({ cleanAfterEveryBuildPatterns: [`./build/**/*`] });
    configObj.plugins.unshift(clean);
    configObj.devtool = "eval-source-map";
  }

  if (mode === "production") {
    configObj.optimization = {
      minimize: true,
      minimizer: [new TerserPlugin({ extractComments: comments })],
    };
    if (serviceWorker) {
      configObj.plugins.push(new WorkboxPlugin.GenerateSW({ clientsClaim: true, skipWaiting: true }));
      configObj.plugins.push(new WebpackPwaManifest(manifest));
    }
  }

  return configObj;
};

const config = env => {
  return getSelector()
    .then(selector => selector)
    .then(selector => initConfig(env, selector))
    .catch(err => {
      console.log(err);
      initConfig(env);
    });
};

module.exports = config;