let refresh = () => {}

export function setPracticeRefresh(fn: () => void) {
  refresh = fn
}

export function requestPracticeRefresh() {
  refresh()
}
