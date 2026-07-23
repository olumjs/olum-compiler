module.exports = {
  script: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  style: /<style[\s\S]*?>[\s\S]*?<\/style>/gi,
  forOf: /(.*)( of )(.*)/g,
  forIn: /(.*)( in )(.*)/g,
  htmlComment: /\<\!\-\-(?:.|\n|\r)*?-->/gi,
  multiLineComment: /(\/\*)([\s\S]*?)(\*\/)/g,

  selfClosingTag: /<([A-Z](?:"[^"]*"|'[^']*'|[^"'>])*?)\/>/g,
  normalTag: /<([A-Z](?:"[^"]*"|'[^']*'|[^"'>])*?)>([\s\S]*?)<\/[A-Z][^>]*>/g,
  exportDefault: /(export default)(\s+)?(\{)/,
  compExt: /\.html$/i,
};
