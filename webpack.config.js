const path = require("path");
const fs = require("fs");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const WorkboxPlugin = require("workbox-webpack-plugin");
const WebpackPwaManifest = require("webpack-pwa-manifest");
const CopyPlugin = require("copy-webpack-plugin");
const { title, favicon, template, hash, comments, polyfill, assetAsModule, serviceWorker, manifest } = require("../../package.json").olum;

module.exports = env => {
  const mode = !!env.dev ? "development" : "production";
  const globs = [`./src/app.scss`, `./src/app.js`];
  // add devtool if it exists
  const devtoolExists = fs.existsSync(path.resolve(__dirname, "./public/devtool.js"));
  if (mode === "development" && devtoolExists) globs.push("./public/devtool.js");
  const main = polyfill ? ["babel-polyfill", ...globs] : [...globs];

  const config = {
    stats: "errors-warnings",
    mode,
    entry: { main },
    output: {
      path: path.resolve(__dirname, "build"),
      filename: hash ? `app[fullhash:${hash}].js` : `app[fullhash:5].js`,
    },
    plugins: [new HtmlWebpackPlugin({ title, template, favicon })],
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
    config.module.rules.push(obj);
  } else {
    config.plugins.push(new CopyPlugin({ patterns: [{ from: "./src/assets", to: path.resolve(__dirname, `build/assets`) }] }));
  }

  if (mode === "development") {
    const clean = new CleanWebpackPlugin({ cleanAfterEveryBuildPatterns: [`./build/**/*`] });
    config.plugins.unshift(clean);
    config.devtool = "eval-source-map";
  }

  if (mode === "production") {
    config.optimization = { minimize: true, minimizer: [new TerserPlugin({ extractComments: comments })] };
    if (serviceWorker) {
      config.plugins.push(new WorkboxPlugin.GenerateSW({ clientsClaim: true, skipWaiting: true }));
      config.plugins.push(new WebpackPwaManifest(manifest));
    }
  }

  return config;
};
