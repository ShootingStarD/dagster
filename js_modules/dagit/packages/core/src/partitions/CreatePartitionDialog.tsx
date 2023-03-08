import {gql, useMutation} from '@apollo/client';
import {
  Box,
  Button,
  Colors,
  Dialog,
  DialogBody,
  DialogFooter,
  Icon,
  Mono,
  Spinner,
  TextInput,
  Tooltip,
} from '@dagster-io/ui';
import * as React from 'react';
import styled from 'styled-components/macro';

import {showCustomAlert} from '../app/CustomAlertProvider';
import {PythonErrorInfo} from '../app/PythonErrorInfo';
import {testId} from '../testing/testId';
import {repoAddressToSelector} from '../workspace/repoAddressToSelector';
import {RepoAddress} from '../workspace/types';

import {
  AddDynamicPartitionMutation,
  AddDynamicPartitionMutationVariables,
} from './types/CreatePartitionDialog.types';

// Keep in sync with the backend which currently has 2 definitions:
// INVALID_PARTITION_SUBSTRINGS and INVALID_STATIC_PARTITIONS_KEY_CHARACTERS
// https://github.com/dagster-io/dagster/blob/b32508036370678ad0bbc0f117f138fa29b0c33d/python_modules/dagster/dagster/_core/definitions/multi_dimensional_partitions.py#L39
// https://github.com/dagster-io/dagster/blob/b32508036370678ad0bbc0f117f138fa29b0c33d/python_modules/dagster/dagster/_core/definitions/partition.py#L92
const INVALID_PARITION_SUBSTRINGS = [
  '...',
  '\x07', // bell or \a on the backend.
  '\b',
  '\f',
  '\n',
  '\r',
  '\t',
  '\v',
  '\0',
  '|',
  ',',
  '[',
  ']',
  ' ',
];

const INVALID_PARTITION_SUBSTRINGS_READABLE = [
  '...',
  '\\a',
  '\\b',
  '\\f',
  '\\n',
  '\\r',
  '\\t',
  '\\v',
  '\\0',
  '|',
  '","',
  '[',
  ']',
  '" "',
];

export const CreatePartitionDialog = ({
  isOpen,
  partitionDefinitionName,
  close,
  repoAddress,
  refetch,
  selected,
  setSelected,
}: {
  isOpen: boolean;
  partitionDefinitionName?: string | null;
  close: () => void;
  repoAddress: RepoAddress;
  refetch?: () => Promise<void>;
  selected: string[];
  setSelected: (selected: string[]) => void;
}) => {
  const [partitionName, setPartitionName] = React.useState('');

  const [createPartition] = useMutation<
    AddDynamicPartitionMutation,
    AddDynamicPartitionMutationVariables
  >(CREATE_PARTITION_MUTATION);

  const [isSaving, setIsSaving] = React.useState(false);

  const isValidPartitionName = React.useMemo(() => {
    return (
      partitionName.length === 0 ||
      !INVALID_PARITION_SUBSTRINGS.some((s) => partitionName.includes(s))
    );
  }, [partitionName]);

  const error = isValidPartitionName ? null : (
    <span data-testid={testId('warning-icon')}>
      <Tooltip
        content={
          <div>
            The following substrings are not allowed:{' '}
            <Mono>[{INVALID_PARTITION_SUBSTRINGS_READABLE.join(',')}]</Mono>
          </div>
        }
        placement="top"
      >
        <Icon name="warning" />
      </Tooltip>
    </span>
  );

  const handleSave = async () => {
    if (!isValidPartitionName) {
      return;
    }
    setIsSaving(true);
    const result = await createPartition({
      variables: {
        repositorySelector: repoAddressToSelector(repoAddress),
        partitionsDefName: partitionDefinitionName || '',
        partitionKey: partitionName,
      },
    });
    setIsSaving(false);

    const data = result.data?.addDynamicPartition;
    switch (data?.__typename) {
      case 'PythonError': {
        showCustomAlert({
          title: 'Could not create environment variable',
          body: <PythonErrorInfo error={data} />,
        });
        break;
      }
      case 'DuplicateDynamicPartitionError': {
        showCustomAlert({
          title: 'Could not add partition',
          body: 'A partition this name already exists.',
        });
        break;
      }
      case 'UnauthorizedError': {
        showCustomAlert({
          title: 'Could not add partition',
          body: 'You do not have permission to do this.',
        });
        break;
      }
      case 'AddDynamicPartitionSuccess': {
        refetch?.();
        setSelected([...selected, partitionName]);
        close();
        break;
      }
      default: {
        showCustomAlert({
          title: 'Could not add partition',
          body: 'An unknown error occurred.',
        });
        break;
      }
    }
  };
  return (
    <Dialog
      isOpen={isOpen}
      canEscapeKeyClose
      canOutsideClickClose
      title={
        <Box flex={{direction: 'row', gap: 8, alignItems: 'center'}}>
          <Icon name="add_circle" size={24} />
          <div>
            Add a partition
            {partitionDefinitionName ? (
              <>
                {' '}
                for <Mono>{partitionDefinitionName}</Mono>
              </>
            ) : (
              ''
            )}
          </div>
        </Box>
      }
    >
      <DialogBody>
        <Box flex={{direction: 'column', gap: 6}}>
          <div>Partition name</div>
          <PartitionBox>
            <TextInput
              data-testid={testId('partition-input')}
              rightElement={error ?? (isSaving ? <Spinner purpose="body-text" /> : undefined)}
              disabled={isSaving}
              placeholder="name"
              value={partitionName}
              onChange={(e) => setPartitionName(e.target.value)}
              onKeyPress={(e) => {
                if (e.code === 'Enter') {
                  handleSave();
                }
              }}
              strokeColor={isValidPartitionName ? undefined : Colors.Red500}
            />
          </PartitionBox>
        </Box>
      </DialogBody>
      <DialogFooter>
        <Button onClick={close}>Cancel</Button>
        <Button
          intent="primary"
          onClick={handleSave}
          disabled={!isValidPartitionName}
          data-testid={testId('save-partition-button')}
        >
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

export const CREATE_PARTITION_MUTATION = gql`
  mutation AddDynamicPartitionMutation(
    $partitionsDefName: String!
    $partitionKey: String!
    $repositorySelector: RepositorySelector!
  ) {
    addDynamicPartition(
      partitionsDefName: $partitionsDefName
      partitionKey: $partitionKey
      repositorySelector: $repositorySelector
    ) {
      __typename
      ... on AddDynamicPartitionSuccess {
        partitionsDefName
        partitionKey
      }
      ... on PythonError {
        message
        stack
      }
      ... on UnauthorizedError {
        message
      }
    }
  }
`;

const PartitionBox = styled.div`
  display: flex;
  flex-direction: row;
  gap: 8;
  align-items: center;
  > *:first-child {
    flex-grow: 1;
  }
`;