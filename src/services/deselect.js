import { $ } from "olum-helpers";
function deselect() {
  const selectAllInput = $(".selectAll input");
  if (selectAllInput) {
    selectAllInput.checked = false;
  }
}

export default deselect;
