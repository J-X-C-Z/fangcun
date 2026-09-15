import file from "@system.file"

const URI = "internal://files/fangcun_link_snapshot.json"
const ACTION_URI = "internal://files/fangcun_link_actions.json"

function get() {
  return new Promise(resolve => file.readText({
    uri: URI,
    success: value => resolve(value && value.text ? value.text : ""),
    fail: () => resolve("")
  }))
}

function set(value) {
  return new Promise((resolve, reject) => file.writeText({
    uri: URI,
    text: value,
    success: resolve,
    fail: reject
  }))
}

function getActions() {
  return new Promise(resolve => file.readText({
    uri: ACTION_URI,
    success: value => resolve(value && value.text ? value.text : "[]"),
    fail: () => resolve("[]")
  }))
}

function setActions(value) {
  return new Promise((resolve, reject) => file.writeText({
    uri: ACTION_URI,
    text: value,
    success: resolve,
    fail: reject
  }))
}

export default { get, set, getActions, setActions }
