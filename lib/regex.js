module.exports = {
  forOf: /(.*)( of )(.*)/g,
  forIn: /(.*)( in )(.*)/g,

  selfClosingTag: /<([A-Z](?:"[^"]*"|'[^']*'|[^"'>])*?)\/>/g,
  normalTag: /<([A-Z](?:"[^"]*"|'[^']*'|[^"'>])*?)>([\s\S]*?)<\/[A-Z][^>]*>/g,
  compExt: /\.html$/i,
};
