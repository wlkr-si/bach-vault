export const titleWords = title => title.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

export function addBalance(records) {
  const fields = ['complexity', 'sync', 'uniqueness']
  const field = records.filter(record => fields.every(key => Number.isFinite(record[key])))
  for (const record of records) Object.assign(record, {balance: null, standing: {}})
  if (field.length >= 5) {
    for (const key of fields) {
      const ordered = field.slice().sort((a, b) => a[key] - b[key])
      let first = 0
      while (first < ordered.length) {
        let end = first + 1
        while (end < ordered.length && ordered[end][key] === ordered[first][key]) end++
        const standing = (first + end - 1) / 2 / (ordered.length - 1) * 100
        for (let i = first; i < end; i++) ordered[i].standing[key] = standing
        first = end
      }
    }
    for (const record of field) record.balance = Math.min(...fields.map(key => record.standing[key]))
  }
}
