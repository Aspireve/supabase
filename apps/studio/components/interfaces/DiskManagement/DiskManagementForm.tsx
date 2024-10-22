import { zodResolver } from '@hookform/resolvers/zod'
import { PermissionAction } from '@supabase/shared-types/out/constants'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CpuIcon,
  HelpCircle,
  InfoIcon,
  Microchip,
  RotateCcw,
  SeparatorVertical,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { useParams } from 'common'
import DiskSpaceBar from 'components/interfaces/DiskManagement/DiskSpaceBar'
import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'
import { FormHeader } from 'components/ui/Forms/FormHeader'
import {
  useDiskAttributesQuery,
  useRemainingDurationForDiskAttributeUpdate,
} from 'data/config/disk-attributes-query'
import { useUpdateDiskAttributesMutation } from 'data/config/disk-attributes-update-mutation'
import { useDiskUtilizationQuery } from 'data/config/disk-utilization-query'
import { useReadReplicasQuery } from 'data/read-replicas/replicas-query'
import { useOrgSubscriptionQuery } from 'data/subscriptions/org-subscription-query'
import { useProjectAddonsQuery } from 'data/subscriptions/project-addons-query'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'
import { useSelectedOrganization } from 'hooks/misc/useSelectedOrganization'
import { GB, INSTANCE_MICRO_SPECS } from 'lib/constants'
import {
  Alert_Shadcn_,
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  Form_Shadcn_,
  FormControl_Shadcn_,
  FormField_Shadcn_,
  FormItem_Shadcn_,
  Input_Shadcn_ as Input,
  RadioGroupCard,
  RadioGroupCardItem,
  Separator,
  Tooltip_Shadcn_,
  TooltipContent_Shadcn_,
  TooltipTrigger_Shadcn_,
} from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import { FormFooterChangeBadge } from '../DataWarehouse/FormFooterChangeBadge'
import BillingChangeBadge from './BillingChangeBadge'
import { DiskCountdownRadial } from './DiskCountdownRadial'
import {
  COMPUTE_SIZE_MAX_IOPS,
  COMPUTE_SIZE_MAX_THROUGHPUT,
  DiskType,
  IOPS_RANGE,
  PLAN_DETAILS,
  THROUGHPUT_RANGE,
} from './DiskManagement.constants'
import {
  calculateComputeSizePrice,
  calculateDiskSizePrice,
  calculateIOPSPrice,
  calculateThroughputPrice,
  getAvailableComputeOptions,
} from './DiskManagement.utils'
import { DiskStorageSchema, DiskStorageSchemaType } from './DiskManagementPanelSchema'
import { DiskManagementPlanUpgradeRequired } from './DiskManagementPlanUpgradeRequired'
import {
  DiskManagementDiskSizeReadReplicas,
  DiskManagementIOPSReadReplicas,
  DiskManagementThroughputReadReplicas,
} from './DiskManagementReadReplicas'
import { DiskManagementReviewAndSubmitDialog } from './DiskManagementReviewAndSubmitDialog'
import { useOrgPlansQuery } from 'data/subscriptions/org-plans-query'
import { ProjectAddonVariantMeta } from 'data/subscriptions/types'
import { getCloudProviderArchitecture } from 'lib/cloudprovider-utils'
import { ComputeBadge } from 'ui-patterns'
import { components } from 'api-types'
import { MAX_WIDTH_CLASSES, PADDING_CLASSES, ScaffoldContainer } from 'components/layouts/Scaffold'

export function DiskManagementForm() {
  const { project } = useProjectContext()
  const org = useSelectedOrganization()
  const { ref: projectRef } = useParams()

  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [remainingTime, setRemainingTime] = useState(0)
  const [refetchInterval, setRefetchInterval] = useState<number | false>(false)

  const canUpdateDiskConfiguration = useCheckPermissions(PermissionAction.UPDATE, 'projects', {
    resource: {
      project_id: project?.id,
    },
  })

  /**
   * Queries for form data
   */

  const {
    data: databases,
    isLoading: isReadReplicasLoading,
    error: readReplicasError,
    isSuccess: isReadReplicasSuccess,
  } = useReadReplicasQuery({ projectRef })
  const {
    data,
    isLoading: isDiskAttributesLoading,
    error: diskAttributesError,
    isSuccess: isDiskAttributesSuccess,
  } = useDiskAttributesQuery(
    { projectRef },
    {
      refetchInterval,
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        // @ts-ignore
        const { type, iops, throughput_mbps, size_gb } = data?.attributes ?? { size_gb: 0 }
        const formValues = {
          storageType: type,
          provisionedIOPS: iops,
          throughput: throughput_mbps,
          totalSize: size_gb,
        }

        if (!('requested_modification' in data)) {
          if (refetchInterval !== false) {
            form.reset(formValues)
            setRefetchInterval(false)
            toast.success('Disk configuration changes have been successfully applied!')
          }
        }
      },
    }
  )
  const {
    data: addons,
    isLoading: isAddonsLoading,
    error: addonsError,
    isSuccess: isAddonsSuccess,
  } = useProjectAddonsQuery({ projectRef })
  const { remainingDuration: initialRemainingTime, isWithinCooldownWindow } =
    useRemainingDurationForDiskAttributeUpdate({
      projectRef,
    })
  const {
    data: diskUtil,
    isLoading: isDiskUtilizationLoading,
    error: diskUtilError,
    isSuccess: isDiskUtilizationSuccess,
  } = useDiskUtilizationQuery({
    projectRef,
  })
  const {
    data: subscription,
    isLoading: isSubscriptionLoading,
    error: subscriptionError,
    isSuccess: isSubscriptionSuccess,
  } = useOrgSubscriptionQuery({
    orgSlug: org?.slug,
  })

  /**
   * Handle compute instances
   */
  const availableAddons = useMemo(() => {
    return addons?.available_addons ?? []
  }, [addons])

  const selectedAddons = addons?.selected_addons ?? []
  const subscriptionCompute = selectedAddons.find((addon) => addon.type === 'compute_instance')

  const availableOptions = useMemo(() => {
    return getAvailableComputeOptions(availableAddons, project?.cloud_provider)
  }, [availableAddons, project?.cloud_provider])

  /**
   * Handle default values
   */
  // @ts-ignore [Joshen TODO] check whats happening here
  const { type, iops, throughput_mbps, size_gb } = data?.attributes ?? { size_gb: 0 }
  const defaultValues = {
    storageType: type ?? 'gp3',
    provisionedIOPS: iops,
    throughput: throughput_mbps,
    totalSize: size_gb,
    computeSize: subscriptionCompute?.variant.identifier ?? 'ci_micro',
  }

  const form = useForm<DiskStorageSchemaType>({
    resolver: zodResolver(DiskStorageSchema),
    defaultValues,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  /**
   * State handling
   */
  const isLoading =
    isAddonsLoading ||
    isDiskAttributesLoading ||
    isDiskUtilizationLoading ||
    isReadReplicasLoading ||
    isSubscriptionLoading
  const error =
    addonsError ?? diskAttributesError ?? diskUtilError ?? readReplicasError ?? subscriptionError
  const isSuccess =
    isAddonsSuccess &&
    isDiskAttributesSuccess &&
    isDiskUtilizationSuccess &&
    isReadReplicasSuccess &&
    isSubscriptionSuccess

  const isRequestingChanges = data?.requested_modification !== undefined

  const readReplicas = (databases ?? []).filter((db) => db.identifier !== projectRef)

  const currentCompute = (addons?.selected_addons ?? []).find((x) => x.type === 'compute_instance')
    ?.variant
  const maxIopsBasedOnCompute =
    COMPUTE_SIZE_MAX_IOPS[(currentCompute?.identifier ?? '') as keyof typeof COMPUTE_SIZE_MAX_IOPS]
  const maxThroughputBasedOnCompute =
    COMPUTE_SIZE_MAX_THROUGHPUT[
      (currentCompute?.identifier ?? '') as keyof typeof COMPUTE_SIZE_MAX_THROUGHPUT
    ]

  const planId = subscription?.plan.id ?? 'free'
  const isPlanUpgradeRequired =
    subscription?.plan.id === 'pro' && !subscription.usage_billing_enabled

  const mainDiskUsed = Math.round(((diskUtil?.metrics.fs_used_bytes ?? 0) / GB) * 100) / 100

  const { watch, setValue, trigger, control, formState } = form

  const watchedStorageType = watch('storageType')
  const watchedTotalSize = watch('totalSize')
  const watchedIOPS = watch('provisionedIOPS')
  const { dirtyFields } = formState // Destructure dirtyFields from formState
  const isAllocatedStorageDirty = !!dirtyFields.totalSize // Check if 'allocatedStorage' is dirty
  const disableInput =
    isRequestingChanges ||
    isPlanUpgradeRequired ||
    isWithinCooldownWindow ||
    !canUpdateDiskConfiguration

  const { includedDiskGB: includedDiskGBMeta } =
    PLAN_DETAILS?.[planId as keyof typeof PLAN_DETAILS] ?? {}
  console.log('includedDiskGBMeta', includedDiskGBMeta)
  console.log('watchedStorageType', watchedStorageType)
  const includedDiskGB = includedDiskGBMeta[watchedStorageType]

  const minIOPS = IOPS_RANGE[watchedStorageType]?.min ?? 0
  const maxIOPS =
    watchedStorageType === 'gp3'
      ? Math.min(500 * watchedTotalSize, IOPS_RANGE[DiskType.GP3].max)
      : Math.min(1000 * watchedTotalSize, IOPS_RANGE[DiskType.IO2].max)
  const minThroughput =
    watchedStorageType === 'gp3' ? THROUGHPUT_RANGE[watchedStorageType]?.min ?? 0 : 0
  const maxThroughput =
    watchedStorageType === 'gp3'
      ? Math.min(0.25 * watchedIOPS, THROUGHPUT_RANGE[DiskType.GP3].max)
      : undefined

  /**
   * Price calculations
   */

  const computeSizePrice = calculateComputeSizePrice({
    availableOptions: availableOptions,
    oldComputeSize: form.formState.defaultValues?.computeSize || 'ci_micro',
    newComputeSize: form.getValues('computeSize'),
  })
  const diskSizePrice = calculateDiskSizePrice({
    planId,
    oldSize: form.formState.defaultValues?.totalSize || 0,
    oldStorageType: form.formState.defaultValues?.storageType as DiskType,
    newSize: form.getValues('totalSize'),
    newStorageType: form.getValues('storageType') as DiskType,
  })
  const iopsPrice = calculateIOPSPrice({
    oldStorageType: form.formState.defaultValues?.storageType as DiskType,
    oldProvisionedIOPS: form.formState.defaultValues?.provisionedIOPS || 0,
    newStorageType: form.getValues('storageType') as DiskType,
    newProvisionedIOPS: form.getValues('provisionedIOPS'),
  })
  const throughputPrice = calculateThroughputPrice({
    storageType: form.getValues('storageType') as DiskType,
    newThroughput: form.getValues('throughput') || 0,
    oldThroughput: form.formState.defaultValues?.throughput || 0,
  })

  useEffect(() => {
    // Initialize field values properly when data has been loaded
    if (isSuccess) form.reset(defaultValues)
  }, [isSuccess])

  // Watch storageType and allocatedStorage to adjust constraints dynamically
  useEffect(() => {
    if (watchedStorageType === 'io2') {
      setValue('throughput', undefined) // Throughput is not configurable for 'io2'
    } else if (watchedStorageType === 'gp3') {
      // Ensure throughput is within the allowed range if it's greater than or equal to 400 GB
      const currentThroughput = form.getValues('throughput')
      const { min, max } = THROUGHPUT_RANGE[DiskType.GP3]
      if (!currentThroughput || currentThroughput < min || currentThroughput > max) {
        setValue('throughput', min) // Reset to default if undefined or out of bounds
      }
    }
  }, [watchedStorageType, watchedTotalSize, setValue, form])

  useEffect(() => {
    if (initialRemainingTime > 0) setRemainingTime(initialRemainingTime)
  }, [initialRemainingTime])

  useEffect(() => {
    if (remainingTime <= 0) return

    const timer = setInterval(() => {
      setRemainingTime(Math.max(0, remainingTime - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [remainingTime])

  const { mutate: updateDiskConfigurationRQ, isLoading: isUpdatingDiskConfiguration } =
    useUpdateDiskAttributesMutation({
      onSuccess: (_, vars) => {
        toast.success(
          'Successfully requested disk configuration changes! Your changes will be applied shortly'
        )
        const { ref, ...formData } = vars
        setIsDialogOpen(false)
        setRefetchInterval(3000)
        form.reset(formData as DiskStorageSchemaType)
      },
    })

  const onSubmit = async (data: DiskStorageSchemaType) => {
    if (projectRef === undefined) return console.error('Project ref is required')
    updateDiskConfigurationRQ({ ref: projectRef, ...data })
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (planId === 'free') {
    return (
      <div id="disk-management">
        <FormHeader
          title="Disk Management"
          docsUrl="https://supabase.com/docs/guides/platform/database-size#disk-management"
        />
        <Alert_Shadcn_>
          <InfoIcon />
          <AlertTitle_Shadcn_>
            Disk size configuration is not available for projects on the Free Plan
          </AlertTitle_Shadcn_>
          <AlertDescription_Shadcn_>
            <p>
              If you are intending to use more than 500MB of disk space, then you will need to
              upgrade to at least the Pro Plan.
            </p>
            <Button asChild type="default" className="mt-3">
              <Link
                target="_blank"
                rel="noreferrer"
                href={`/org/${org?.slug}/billing?panel=subscriptionPlan`}
              >
                Upgrade plan
              </Link>
            </Button>
          </AlertDescription_Shadcn_>
        </Alert_Shadcn_>
      </div>
    )
  }

  // return <></>

  const isDirty = !!Object.keys(form.formState.dirtyFields).length

  return (
    <Form_Shadcn_ {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8">
        <ScaffoldContainer className="relative flex flex-col gap-10" bottomPadding>
          {/* {showNewDiskManagementUI ? <DiskManagementForm /> : null} */}
          <Separator />

          <FormField_Shadcn_
            name="computeSize"
            control={form.control}
            render={({ field }) => (
              <>
                <FormItemLayout
                  layout="horizontal"
                  label={'Compute size'}
                  labelOptional={
                    <>
                      <BillingChangeBadge
                        className={'mb-2'}
                        show={
                          formState.isDirty &&
                          formState.dirtyFields.computeSize &&
                          !formState.errors.computeSize
                        }
                        beforePrice={Number(computeSizePrice.oldPrice)}
                        afterPrice={Number(computeSizePrice.newPrice)}
                      />
                      <p>hardware resources allocated to your postgres database</p>
                    </>
                  }
                >
                  <RadioGroupCard
                    className="grid grid-cols-3 flex-wrap gap-3"
                    onValueChange={(value) => {
                      setValue('computeSize', value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    {availableOptions.map((compute) => {
                      const cpuArchitecture = getCloudProviderArchitecture(project?.cloud_provider)

                      return (
                        <RadioGroupCardItem
                          showIndicator={false}
                          value={compute.identifier}
                          className="text-sm text-left flex flex-col gap-0 px-0 py-3 overflow-hidden [&_label]:w-full group] w-full"
                          // @ts-ignore
                          label={
                            <div className="w-full flex flex-col gap-3">
                              <div className="px-3 opacity-50 group-data-[state=checked]:opacity-100 flex justify-between">
                                <ComputeBadge
                                  className="inline-flex font-semibold"
                                  infraComputeSize={
                                    compute.name as components['schemas']['DbInstanceSize']
                                  }
                                />
                                <div className="flex items-center space-x-1">
                                  <span className="text-foreground text-sm font-semibold">
                                    {/* Price needs to be exact here */}${compute.price}
                                  </span>
                                  <span className="text-foreground-light translate-y-[1px]">
                                    {' '}
                                    / {compute.price_interval === 'monthly' ? 'month' : 'hour'}
                                  </span>
                                </div>
                              </div>
                              {/* <Separator className="bg-border group-data-[state=checked]:bg-foreground-muted" /> */}
                              <div className="w-full">
                                <div className="px-3 text-sm flex flex-col gap-1">
                                  <div className="text-foreground-light flex gap-2 items-center">
                                    <Microchip
                                      strokeWidth={1}
                                      size={14}
                                      className="text-foreground-lighter"
                                    />
                                    <span>{compute.meta?.memory_gb ?? 0} GB memory</span>
                                  </div>
                                  <div className="text-foreground-light flex gap-2 items-center">
                                    <CpuIcon
                                      strokeWidth={1}
                                      size={14}
                                      className="text-foreground-lighter"
                                    />
                                    <span>
                                      {compute.meta?.cpu_cores ?? 0}-core {cpuArchitecture} CPU
                                    </span>
                                  </div>
                                </div>
                                {/* <div className="px-2">
                      <span>{compute.meta?.cpu_dedicated ? 'Dedicated' : 'Shared'}</span>
                    </div> */}

                                {/* <div className="px-3 py-1">
                          <div className="flex items-center space-x-1">
                            <span className="text-foreground text-sm">
                              ${compute.price}
                            </span>
                            <span className="text-foreground-light translate-y-[1px]">
                              {' '}
                              / {compute.price_interval === 'monthly' ? 'month' : 'hour'}
                            </span>
                          </div>
                        </div> */}
                              </div>
                            </div>
                          }
                        ></RadioGroupCardItem>
                      )
                    })}
                  </RadioGroupCard>
                </FormItemLayout>
              </>
            )}
          />
          {/* <Card className="bg-surface-100 rounded-b-none">
              <CardContent className="transition-all duration-500 ease-in-out py-10 flex flex-col gap-10 px-8"> */}

          <Separator />
          <FormField_Shadcn_
            name="storageType"
            control={form.control}
            render={({ field }) => (
              <FormItemLayout layout="horizontal" label="Storage type">
                <FormControl_Shadcn_>
                  <RadioGroupCard
                    className="flex flex-wrap gap-3"
                    {...field}
                    onValueChange={async (e) => {
                      field.onChange(e)
                      // only trigger provisionedIOPS due to other input being hidden
                      await form.trigger('provisionedIOPS')
                      await form.trigger('totalSize')
                    }}
                    defaultValue={field.value}
                    disabled={disableInput}
                  >
                    <FormItem_Shadcn_ asChild>
                      <FormControl_Shadcn_>
                        <RadioGroupCardItem
                          className="grow p-3 px-5"
                          disabled={disableInput}
                          value="gp3"
                          showIndicator={false}
                          // @ts-ignore
                          label={
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-3 items-center">
                                <span className="text-sm">General Purpose SSD</span>{' '}
                                <div>
                                  <Badge
                                    variant={'outline'}
                                    className="font-mono bg-alternative bg-opacity-100"
                                  >
                                    gp3
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-foreground-light">
                                gp3 provides a balance between price and performance
                              </p>
                            </div>
                          }
                        />
                      </FormControl_Shadcn_>
                    </FormItem_Shadcn_>
                    <FormItem_Shadcn_ asChild>
                      <FormControl_Shadcn_>
                        <RadioGroupCardItem
                          className="grow p-3 px-5"
                          disabled={disableInput}
                          value="io2"
                          showIndicator={false}
                          // @ts-ignore
                          label={
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-3 items-center">
                                <span className="text-sm">Provisioned IOPS SSD</span>{' '}
                                <div>
                                  <Badge
                                    variant={'outline'}
                                    className="font-mono bg-alternative bg-opacity-100"
                                  >
                                    io2
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-foreground-light">
                                io2 offers high IOPS for mission-critical applications.
                              </p>
                            </div>
                          }
                        />
                      </FormControl_Shadcn_>
                    </FormItem_Shadcn_>
                  </RadioGroupCard>
                </FormControl_Shadcn_>
              </FormItemLayout>
            )}
          />
          <FormField_Shadcn_
            control={form.control}
            name="provisionedIOPS"
            render={({ field }) => (
              <FormItemLayout
                layout="horizontal"
                label="IOPS"
                description={
                  <div className="flex flex-col gap-y-2">
                    <div>
                      {watchedStorageType === 'io2' ? (
                        <div className="flex items-center gap-x-2">
                          <span>
                            IOPS must be{' '}
                            {watchedTotalSize >= 8
                              ? `between ${minIOPS} and ${maxIOPS.toLocaleString()} based on your disk size.`
                              : `at least ${minIOPS}`}
                          </span>
                          <Tooltip_Shadcn_>
                            <TooltipTrigger_Shadcn_ asChild>
                              <HelpCircle size={14} className="transition hover:text-foreground" />
                            </TooltipTrigger_Shadcn_>
                            <TooltipContent_Shadcn_ side="bottom">
                              For io2 storage type, min IOPS is at {minIOPS}, while max IOPS is at
                              1000 * disk size in GB or{' '}
                              {IOPS_RANGE[DiskType.IO2].max.toLocaleString()}, whichever is lower
                            </TooltipContent_Shadcn_>
                          </Tooltip_Shadcn_>
                        </div>
                      ) : (
                        <div className="flex items-center gap-x-2">
                          <span>
                            IOPS must be{' '}
                            {watchedTotalSize >= 8
                              ? `between ${minIOPS.toLocaleString()} and ${maxIOPS.toLocaleString()} based on your disk size.`
                              : `at least ${minIOPS.toLocaleString()}`}
                          </span>
                          <Tooltip_Shadcn_>
                            <TooltipTrigger_Shadcn_ asChild>
                              <HelpCircle size={14} className="transition hover:text-foreground" />
                            </TooltipTrigger_Shadcn_>
                            <TooltipContent_Shadcn_ side="bottom" className="w-64">
                              For gp3 storage type, min IOPS is at {minIOPS} while max IOPS is at
                              500 * disk size in GB or{' '}
                              {IOPS_RANGE[DiskType.GP3].max.toLocaleString()}, whichever is lower
                            </TooltipContent_Shadcn_>
                          </Tooltip_Shadcn_>
                        </div>
                      )}
                      {!form.formState.errors.provisionedIOPS &&
                        field.value > maxIopsBasedOnCompute && (
                          <p>
                            Note: Final usable IOPS will be at{' '}
                            <span className="text-foreground">
                              {maxIopsBasedOnCompute.toLocaleString()}
                            </span>{' '}
                            based on your current compute size of {currentCompute?.name}
                          </p>
                        )}
                    </div>
                    {!form.formState.errors.provisionedIOPS && (
                      <DiskManagementIOPSReadReplicas
                        isDirty={form.formState.dirtyFields.provisionedIOPS !== undefined}
                        oldIOPS={iops ?? 0}
                        newIOPS={field.value}
                        oldStorageType={form.formState.defaultValues?.storageType as DiskType}
                        newStorageType={form.getValues('storageType') as DiskType}
                      />
                    )}
                  </div>
                }
                labelOptional={
                  <>
                    <BillingChangeBadge
                      show={
                        (watchedStorageType !== type ||
                          (watchedStorageType === 'gp3' && field.value !== iops)) &&
                        !formState.errors.provisionedIOPS
                      }
                      beforePrice={Number(iopsPrice.oldPrice)}
                      afterPrice={Number(iopsPrice.newPrice)}
                      className="mb-2"
                    />
                    <p>
                      Input/output operations per second. Higher IOPS is suitable for applications
                      requiring high throughput.
                    </p>
                  </>
                }
              >
                <div className="flex gap-3 items-center">
                  <div className="flex -space-x-px">
                    <FormControl_Shadcn_>
                      <Input
                        id="provisionedIOPS"
                        type="number"
                        className="flex-grow font-mono rounded-r-none max-w-32"
                        {...field}
                        disabled={disableInput}
                        onChange={(e) => {
                          setValue('provisionedIOPS', e.target.valueAsNumber, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }}
                      />
                    </FormControl_Shadcn_>
                    <div className="border border-strong bg-surface-300 rounded-r-md px-3 flex items-center justify-center">
                      <span className="text-foreground-lighter text-xs font-mono">IOPS</span>
                    </div>
                  </div>
                </div>
              </FormItemLayout>
            )}
          />
          <AnimatePresence initial={false}>
            {form.getValues('storageType') === 'gp3' && (
              <motion.div
                key="throughPutContainer"
                initial={{ opacity: 0, x: -4, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: -4, height: 0 }}
                transition={{ duration: 0.1 }}
                style={{ overflow: 'hidden' }}
              >
                <FormField_Shadcn_
                  name="throughput"
                  control={control}
                  render={({ field }) => (
                    <FormItemLayout
                      label="Throughput (MB/s)"
                      layout="horizontal"
                      description={
                        <div className="flex flex-col gap-y-2">
                          <div>
                            <div className="flex items-center gap-x-2">
                              <span>
                                Throughput must be between {minThroughput.toLocaleString()} and{' '}
                                {maxThroughput?.toLocaleString()} MB/s based on your IOPS.
                              </span>
                              <Tooltip_Shadcn_>
                                <TooltipTrigger_Shadcn_ asChild>
                                  <HelpCircle
                                    size={14}
                                    className="transition hover:text-foreground"
                                  />
                                </TooltipTrigger_Shadcn_>
                                <TooltipContent_Shadcn_ side="bottom" className="w-64">
                                  Min throughput is at 125MB/s, while max throughput is at 0.25MB/s
                                  * IOPS or 1,000, whichever is lower
                                </TooltipContent_Shadcn_>
                              </Tooltip_Shadcn_>
                            </div>
                            {!form.formState.errors.throughput &&
                              field.value !== undefined &&
                              field.value > maxThroughputBasedOnCompute && (
                                <p>
                                  Note: Final usable throughput will be at{' '}
                                  <span className="text-foreground">
                                    {maxThroughputBasedOnCompute.toFixed(0)}
                                  </span>{' '}
                                  MB/s based on your current compute size of {currentCompute?.name}
                                </p>
                              )}
                          </div>
                          {!form.formState.errors.throughput && (
                            <DiskManagementThroughputReadReplicas
                              isDirty={form.formState.dirtyFields.throughput !== undefined}
                              oldThroughput={throughput_mbps ?? 0}
                              newThroughput={field.value ?? 0}
                              oldStorageType={form.formState.defaultValues?.storageType as DiskType}
                              newStorageType={form.getValues('storageType') as DiskType}
                            />
                          )}
                        </div>
                      }
                      labelOptional={
                        <>
                          <BillingChangeBadge
                            show={
                              formState.isDirty &&
                              formState.dirtyFields.throughput &&
                              !formState.errors.throughput
                            }
                            beforePrice={Number(throughputPrice.oldPrice)}
                            afterPrice={Number(throughputPrice.newPrice)}
                            className="mb-2"
                          />
                          <p>
                            Throughput is the amount of data that can be read or written to the disk
                            per second. Higher throughput is suitable for applications requiring
                            high throughput.
                          </p>
                        </>
                      }
                    >
                      <div className="flex gap-3 items-center">
                        <div className="flex -space-x-px">
                          <FormControl_Shadcn_>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => {
                                setValue('throughput', e.target.valueAsNumber, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }}
                              className="flex-grow font-mono rounded-r-none max-w-32"
                              disabled={disableInput || watchedStorageType === 'io2'}
                            />
                          </FormControl_Shadcn_>
                          <div className="border border-strong bg-surface-300 rounded-r-md px-3 flex items-center justify-center">
                            <span className="text-foreground-lighter text-xs font-mono">MB/s</span>
                          </div>
                        </div>
                      </div>
                    </FormItemLayout>
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {/* </CardContent> */}
          <Separator />

          <FormField_Shadcn_
            name="totalSize"
            control={control}
            render={({ field }) => (
              <FormItemLayout
                label="Disk Size"
                layout="horizontal"
                description={
                  includedDiskGB > 0 &&
                  `Your plan includes ${includedDiskGB} GB of disk size for ${watchedStorageType}.`
                }
              >
                <div className="mt-1 relative flex gap-2 items-center">
                  <div className="flex -space-x-px max-w-48">
                    <FormControl_Shadcn_>
                      <Input
                        type="number"
                        step="1"
                        {...field}
                        disabled={disableInput}
                        className="flex-grow font-mono rounded-r-none"
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => {
                          setValue('totalSize', e.target.valueAsNumber, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                          trigger('provisionedIOPS')
                          trigger('throughput')
                        }}
                        min={includedDiskGB}
                      />
                    </FormControl_Shadcn_>
                    <div className="border border-strong bg-surface-300 rounded-r-md px-3 flex items-center justify-center">
                      <span className="text-foreground-lighter text-xs font-mono">GB</span>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {isAllocatedStorageDirty && (
                      <motion.div
                        key="reset-disksize"
                        initial={{ opacity: 0, scale: 0.95, x: -2 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95, x: -2 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button
                          htmlType="button"
                          type="default"
                          size="small"
                          className="px-2"
                          onClick={() => form.resetField('totalSize')}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <BillingChangeBadge
                    beforePrice={Number(diskSizePrice.oldPrice)}
                    afterPrice={Number(diskSizePrice.newPrice)}
                    show={
                      formState.isDirty &&
                      !formState.errors.totalSize &&
                      diskSizePrice.oldPrice !== diskSizePrice.newPrice
                    }
                  />
                </div>
              </FormItemLayout>
            )}
          />
          <div className="grid grid-cols-12 gap-3">
            {/* You can add additional content in the remaining 4 columns if needed */}
            <div className="col-span-4">{/* Additional content or information can go here */}</div>
            <div className="col-span-8 space-y-6 mt-6">
              <DiskSpaceBar
                showNewBar={form.formState.dirtyFields.totalSize !== undefined}
                totalSize={size_gb}
                usedSize={mainDiskUsed}
                newTotalSize={watchedTotalSize}
              />
              <DiskManagementDiskSizeReadReplicas
                isDirty={form.formState.dirtyFields.totalSize !== undefined}
                totalSize={size_gb * 1.25}
                usedSize={mainDiskUsed}
                newTotalSize={watchedTotalSize * 1.25}
                oldStorageType={form.formState.defaultValues?.storageType as DiskType}
                newStorageType={form.getValues('storageType') as DiskType}
              />
            </div>
          </div>

          {/* </Card> */}

          {isRequestingChanges ? (
            <Card className="px-2 rounded-none">
              <CardContent className="py-3 flex gap-3 px-3 items-center">
                <div className="flex flex-col">
                  <p className="text-foreground-lighter text-sm p-0">
                    Disk configuration changes have been requested
                  </p>
                  <p className="text-sm">
                    The requested changes will be applied to your disk shortly
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <DiskCountdownRadial remainingTime={remainingTime} />
          )}

          {isPlanUpgradeRequired && <DiskManagementPlanUpgradeRequired />}
        </ScaffoldContainer>

        {/* <Card className="bg-surface-100 rounded-t-none">
              <CardContent className="flex items-center pb-0 py-3 px-8 gap-3 justify-end"> */}

        <AnimatePresence>
          {isDirty ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.1, delay: 0.4 }}
              className="z-10 w-full left-0 right-0 sticky bottom-0 bg-surface-100 border-t h-16 items-center flex"
            >
              <div
                className={cn(
                  MAX_WIDTH_CLASSES,
                  PADDING_CLASSES,
                  'flex items-center gap-3 justify-end'
                )}
              >
                <FormFooterChangeBadge formState={formState} />
                <Button type="default" onClick={() => form.reset()} disabled={!isDirty}>
                  Cancel
                </Button>
                <DiskManagementReviewAndSubmitDialog
                  loading={isUpdatingDiskConfiguration}
                  form={form}
                  numReplicas={readReplicas.length}
                  isDialogOpen={isDialogOpen}
                  isWithinCooldown={disableInput}
                  onSubmit={onSubmit}
                  setIsDialogOpen={setIsDialogOpen}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* </CardContent> */}
        {/* </Card> */}
      </form>
    </Form_Shadcn_>
  )
}
