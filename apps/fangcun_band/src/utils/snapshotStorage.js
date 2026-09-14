import file from "@system.file"

const URI = "internal://files/fangcun_link_snapshot.json"

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

export default { get, set }
