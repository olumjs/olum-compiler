/**
 * @name olum-compiler
 * @version 0.1.1
 * @copyright 2021
 * @author Eissa Saber
 * @license MIT
 */

const renderDev = require("../tasks/dev");
const renderBuild = require("../tasks/build");

module.exports.build = renderBuild;
module.exports.dev = renderDev;