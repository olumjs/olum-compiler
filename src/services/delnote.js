import { Service } from "olum-helpers";
class DelNote extends Service {
  constructor() {
    super("delNote");
  }
}

const delNote = new DelNote();
export default delNote;
