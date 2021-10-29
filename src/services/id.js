export default function genID() {
  return new Date().getTime() + "_" + Math.random().toString(36).slice(2);
}