import { useParams } from 'common'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'

import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'
import StorageBucketsError from 'components/layouts/StorageLayout/StorageBucketsError'
import StorageLayout from 'components/layouts/StorageLayout/StorageLayout'
import ProductEmptyState from 'components/to-be-cleaned/ProductEmptyState'
import { useBucketsQuery } from 'data/storage/buckets-query'
import type { NextPageWithLayout } from 'types'

/**
 * PageLayout is used to setup layout - as usual it will requires inject global store
 */
const PageLayout: NextPageWithLayout = () => {
  const { ref } = useParams()
  const { project } = useProjectContext()
  const { error, isError } = useBucketsQuery({ projectRef: ref })

  if (!project) return <div></div>

  if (isError) <StorageBucketsError error={error as any} />

  return (
    <div className="storage-container flex flex-grow">
      <ProductEmptyState
        title="Storage"
        infoButtonLabel="About storage"
        infoButtonUrl="https://supabase.com/docs/guides/storage"
      >
        <p className="text-foreground-light text-sm">
          Create buckets to store and serve any type of digital content.
        </p>
        <p className="text-foreground-light text-sm">
          Make your buckets private or public depending on your security preference.
        </p>
      </ProductEmptyState>
    </div>
  )
}

PageLayout.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout>
      <StorageLayout title="Buckets">{page}</StorageLayout>
    </DefaultLayout>
  </AppLayout>
)

export default PageLayout
