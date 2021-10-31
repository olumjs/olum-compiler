/**
 * @name olum-compiler
 * @copyright 2021
 * @author Eissa Saber
 * @license MIT
 */

const renderDev = require("../tasks/dev");
const renderBuild = require("../tasks/build");

module.exports.build = renderBuild;
module.exports.dev = renderDev;