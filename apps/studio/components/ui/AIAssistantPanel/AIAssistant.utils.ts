import { CommonDatabaseEntity } from 'state/app-state'
import { SupportedAssistantEntities, SupportedAssistantQuickPromptTypes } from './AIAssistant.types'

const PLACEHOLDER_PREFIX = `-- Press tab to use this code
\n&nbsp;\n`

const PLACEHOLDER_LIMIT = `Just three examples will do.`

export const generateTitle = (
  editor?: SupportedAssistantEntities | null,
  entity?: CommonDatabaseEntity
) => {
  switch (editor) {
    case 'functions':
      if (entity === undefined) return 'Create a new function'
      else return `Edit function: ${entity.name}`
    case 'rls-policies':
      if (entity === undefined) return 'Create a new RLS policy'
      else return `Edit RLS policy: ${entity.name}`
    default:
      return 'SQL Scratch Pad'
  }
}

export const generateCTA = (editor?: SupportedAssistantEntities | null) => {
  switch (editor) {
    case 'functions':
      return 'Save function'
    case 'rls-policies':
      return 'Save policy'
    default:
      return 'Run query'
  }
}

export const generatePlaceholder = (
  editor?: SupportedAssistantEntities | null,
  entity?: CommonDatabaseEntity,
  existingDefinition?: string
) => {
  switch (editor) {
    case 'functions':
      if (entity === undefined) {
        return `${PLACEHOLDER_PREFIX}
CREATE FUNCTION *schema*.*function_name*(*param1 type*, *param2 type*)\n
&nbsp;&nbsp;RETURNS *return_type*\n
&nbsp;&nbsp;LANGUAGE *plpgsql*\n
&nbsp;&nbsp;SECURITY DEFINER\n
&nbsp;&nbsp;SET *search_path = ''*\n
AS $$\n
DECLARE\n
&nbsp;&nbsp;*-- Variable declarations*\n
BEGIN\n
&nbsp;&nbsp;*-- Function logic*\n
END;\n
$$;
`
      } else {
        return `${PLACEHOLDER_PREFIX}
-- To rename the function\n
ALTER FUNCTION *${entity.name}* RENAME TO *new_name*;\n
&nbsp;\n
-- To change the schema of the function\n
ALTER FUNCTION *${entity.name}* SET SCHEMA *new_schema*;\n
&nbsp;\n
-- To update the function body or the arguments, use\n
-- the create or replace statement instead\n
${existingDefinition
  ?.replaceAll(
    '\n ',
    `\n\
  &nbsp;&nbsp;`
  )
  .replaceAll('\n', '\n\n')
  .trim()}
`
      }
    case 'rls-policies':
      return `${PLACEHOLDER_PREFIX}
CREATE POLICY *name* ON *table_name*\n
AS PERMISSIVE -- PERMISSIVE | RESTRICTIVE\n
FOR ALL -- ALL | SELECT | INSERT | UPDATE | DELETE\n
TO *role_name* -- Default: public\n
USING ( *using_expression* )\n
WITH CHECK ( *check_expression* );
`
    default:
      return undefined
  }
}

export const retrieveDocsUrl = (editor?: SupportedAssistantEntities | null) => {
  switch (editor) {
    case 'functions':
      return 'https://supabase.com/docs/guides/database/functions'
    case 'rls-policies':
      return 'https://supabase.com/docs/guides/database/postgres/row-level-security'
    default:
      return undefined
  }
}

// [Joshen] This is just very basic validation, but possible can extend perhaps
export const validateQuery = (editor: SupportedAssistantEntities | null, query: string) => {
  const formattedQuery = query.toLowerCase().replaceAll('\n', ' ')

  switch (editor) {
    case 'functions':
      return (
        formattedQuery.includes('create function') ||
        formattedQuery.includes('create or replace function')
      )
    case 'rls-policies':
      return formattedQuery.includes('create policy')
    default:
      return true
  }
}

export const generatePrompt = ({
  type,
  context,
  schemas,
  tables,
}: {
  type: SupportedAssistantQuickPromptTypes
  context: SupportedAssistantEntities
  schemas: string[]
  tables: { schema: string; name: string }[]
}) => {
  if (type === 'examples') {
    return `What are some common examples of user-defined database ${context}? ${PLACEHOLDER_LIMIT}`
  } else if (type === 'ask') {
    return `Could you explain to me what are used-defined database ${context}?`
  } else if (type === 'suggest') {
    const output =
      context === 'functions'
        ? 'user-defined database functions'
        : context === 'rls-policies'
          ? 'RLS policies'
          : ''

    const suffix =
      context === 'functions' ? 'Let me know for which tables each function will be useful' : ''

    const basePrompt = `Suggest some ${output} that might be useful`

    if (tables.length > 0 && schemas.length > 0) {
      return `${basePrompt} for the following tables within this database: ${tables.map((x) => `${x.schema}.${x.name}`)}. ${PLACEHOLDER_LIMIT} ${suffix}`.trim()
    } else if (schemas.length > 0) {
      return `${basePrompt} for the tables in the following schemas within this database: ${schemas.join(', ')}. ${suffix}`.trim()
    }

    return basePrompt
  }
}

export const isReadOnlySelect = (query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase()

  // Check if it starts with SELECT
  if (!normalizedQuery.startsWith('select')) {
    return false
  }

  // List of keywords that indicate write operations or function calls
  const disallowedPatterns = [
    // Write operations
    'insert',
    'update',
    'delete',
    'alter',
    'drop',
    'create',
    'truncate',
    'replace',
    'with',

    // Function patterns
    'function',
    'procedure',
  ]

  const allowedPatterns = ['inserted']

  // Check if query contains any disallowed patterns, but allow if part of allowedPatterns
  return !disallowedPatterns.some((pattern) => {
    // Check if the found disallowed pattern is actually part of an allowed pattern
    const isPartOfAllowedPattern = allowedPatterns.some(
      (allowed) => normalizedQuery.includes(allowed) && allowed.includes(pattern)
    )

    if (isPartOfAllowedPattern) {
      return false
    }

    return normalizedQuery.includes(pattern)
  })
}
