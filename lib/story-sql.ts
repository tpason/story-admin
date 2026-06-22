/** Slug lives in stories.metadata, not a dedicated column. */
export const STORY_SLUG_EXPR = `COALESCE(NULLIF(s.metadata->>'slug', ''), s.id::text)`;

export const CLEAR_READER_FORMATTED_SQL = `
  reader_formatted_text_content = NULL,
  reader_formatted_source_hash = NULL,
  reader_formatted_content_version = NULL,
  reader_formatted_source = NULL,
  reader_formatted_at = NULL
`;
