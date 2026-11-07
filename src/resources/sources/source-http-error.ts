import { SourcesUnavailableError } from '../../error/errors.js'

const MAX_DETAIL_LENGTH = 500

/** What a source says about a failure, which is the only way to tell apart, for example, a quota from a blocked key */
async function readDetail (response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).trim()

  try {
    const message = JSON.parse(text)?.error
    // Google Books answers { error: { message } } and Open Library, { error }
    const detail = typeof message === 'string' ? message : message?.message
    if (typeof detail === 'string' && detail !== '') return detail.slice(0, MAX_DETAIL_LENGTH)
  } catch {
    // Not JSON: the text itself is the best there is
  }

  return text !== '' ? text.slice(0, MAX_DETAIL_LENGTH) : response.statusText
}

export async function sourceHttpError (response: Response): Promise<SourcesUnavailableError> {
  return new SourcesUnavailableError(`HTTP error ${response.status}: ${await readDetail(response)}`)
}
