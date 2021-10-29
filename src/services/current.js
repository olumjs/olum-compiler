import { $ } from "olum-helpers";
import api from "./api.js";
import deselect from "./deselect.js";
export default function getCurrentTab() {
  deselect();
  const tab = $(".Tabs .activeTab");
  if (!!tab) {
    api.current.tabName = $(tab).get(".tab__title").value.trim();
    api.current.tabId = tab.getAttribute("data-tabid");
    return true;
  }
  return false;
}
