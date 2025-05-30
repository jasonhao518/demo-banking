"use client";

import { useEffect, useReducer } from "react";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import {
  CARD_COLORS,
  NewCardRequest,
  Transaction,
} from "@/app/api/v1/data";
import { CreditCardDetails } from "@/components/credit-card-details";
import { PartialBy } from "@/lib/type-helpers";
import {
  filterTransactionByTitle,
  filterTransactionsByCardLast4,
  filterTransactionsByPolicyId,
  randomDigits,
} from "@/lib/utils";
import useCreditCards from "@/app/cards/actions";
import { useAuthContext } from "@/components/auth-context";
import { AddCardDropdown } from "@/components/add-card-dropdown";
import { TransactionsList } from "@/components/transactions-list";
import { ChangePinDialog } from "@/components/change-pin-dialog";
import { useSearchParams } from "next/navigation";
import { CardsPageOperations } from "@/components/copilot-context";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { PERMISSIONS } from "../api/v1/permissions";

interface ChangePinState {
  newPin: string;
  dialogOpen: boolean;
  cardId: string | null;
  loading: boolean;
}

export default function Page() {
  const { currentUser } = useAuthContext();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") as CardsPageOperations | null;
  const [state, dispatch] = useReducer<
    React.Reducer<ChangePinState, Partial<ChangePinState>>
  >(
    (state: ChangePinState, payload: Partial<ChangePinState>) => ({
      ...state,
      ...payload,
    }),
    { newPin: "", dialogOpen: false, cardId: null, loading: false }
  );
  const {
    cards,
    policies,
    transactions,
    addNewCard,
    changePin,
    assignPolicyToCard,
    addNoteToTransaction,
    changeTransactionStatus,
  } = useCreditCards();

  useEffect(() => {
    const operationNameToMethod: Partial<
      Record<CardsPageOperations, () => void>
    > = {
      [CardsPageOperations.ChangePin]: () => dispatch({ dialogOpen: true }),
    };

    if (!operation || !Object.values(CardsPageOperations).includes(operation))
      return;
    operationNameToMethod[operation]?.();
  }, [operation]);

  const handleChangePinSubmit = async ({
    pin,
    cardId,
  }: {
    pin?: string;
    cardId?: string;
  }) => {
    dispatch({ loading: true });
    await changePin({
      pin: pin ?? state.newPin,
      cardId: cardId ?? state.cardId!,
    });
    dispatch({ loading: false, newPin: "", cardId: null, dialogOpen: false });
  };

  const handleAddCard = async (
    cardRequest: PartialBy<NewCardRequest, "color" | "pin">
  ) => {
    void addNewCard({
      ...cardRequest,
      color: CARD_COLORS[cardRequest.type],
      pin: randomDigits(4).toString(),
    });
  };

  // Enable add new card with co pilot
  useCopilotAction({
    name: "addNewCard",
    description: "Add new credit card",
    disabled: !PERMISSIONS.ADD_CARD.includes(currentUser.role),
    parameters: [
      {
        name: "type",
        type: "string",
        description: "The type of the card (set by user), Visa or Mastercard",
        required: true,
      },
      {
        name: "color",
        type: "string",
        description:
          "The color of the card (generated by copilot, bg-blue-500 for visa, bg-red-500 for mastercard)",
        required: true,
      },
      {
        name: "pin",
        type: "string",
        description: "The pin code of the card (set by user), 4 digits",
        required: true,
      },
    ],
    handler: async ({ type, color, pin }) => {
      await addNewCard({ type, color, pin } as NewCardRequest);
    },
  });

  useCopilotAction({
    name: "assignPolicyToCard",
    description: "Assign a policy to a card",
    disabled: !PERMISSIONS.ADD_POLICY.includes(currentUser.role),
    parameters: [
      {
        name: "cardId",
        type: "string",
        description: "The card (from existing) to assign policy to",
        required: true,
      },
      {
        name: "policyType",
        type: "string",
        description: "The type of the policy to use",
        required: true,
      },
    ],
    handler: async ({ cardId, policyType }) => {
      const policyId = policies.find(
        (policy) => policy.type === policyType
      )?.id;
      if (!policyId)
        throw new Error("Could not find matching policy to assign");
      await assignPolicyToCard({ cardId, policyId });
    },
  });

  useCopilotAction({
    name: "addNoteToTransaction",
    description: "Add note to transaction",
    disabled: !PERMISSIONS.ADD_NOTE.includes(currentUser.role),
    parameters: [
      {
        name: "transactionId",
        type: "string",
        description: "The transaction to add note to (ID provided by copilot)",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "The content of the note",
        required: true,
      },
    ],
    handler: addNoteToTransaction,
  });

  // Showcase usage of generative UI. The only co pilot related that's not in actions, due to usage of TSX
  useCopilotAction({
    name: "showTransactions",
    description:
      "Displays a list of transactions upon request. At least one parameter is required per request",
    disabled: !PERMISSIONS.SHOW_TRANSACTIONS.includes(currentUser.role),
    followUp: false,
    parameters: [
      {
        name: "card4Digits",
        type: "string",
        description: "the last 4 digits of the card",
        required: false,
      },
      {
        name: "policyId",
        type: "string",
        description: "the id of the policy (figured out by copilot)",
        required: false,
      },
      {
        name: "transactionTitle",
        type: "string",
        description: "the title of the transaction",
        required: false,
      },
    ],
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    },
    render: ({ status, args }) => {
      const { card4Digits, policyId, transactionTitle } = args;

      let filteredTransactions = transactions;
      if (card4Digits) {
        filteredTransactions = filterTransactionsByCardLast4(
          transactions,
          cards,
          card4Digits
        );
      } else if (policyId) {
        filteredTransactions = filterTransactionsByPolicyId(
          transactions,
          policyId
        );
      } else if (transactionTitle) {
        filteredTransactions = filterTransactionByTitle(
          transactions,
          transactionTitle
        );
      }

      if (status === "inProgress") {
        return "Loading...";
      } else if (!filteredTransactions) {
        return "Problem fetching transactions";
      } else {
        return <TransactionsList transactions={filteredTransactions} compact />;
      }
    },
  });

  // Enable pin changing with co pilot
  useCopilotAction({
    name: "setCardPin",
    description: "Set the pin code of an existing card",
    disabled: !PERMISSIONS.SET_PIN.includes(currentUser.role),
    parameters: [
      {
        name: "cardId",
        type: "string",
        description: "The id of the card (provided by copilot)",
        required: true,
      },
    ],
    handler: async ({ cardId }) => {
      dispatch({ dialogOpen: true, cardId });
    },
  });

  useCopilotAction({
    name: "showAndApproveTransactions",
    description: `
      This operation is per department.
      An executive department admin is allowed to approve/deny from other departments as well
      
      Show the unapproved transactions and allow the admin per department to approve them.
      
      Transactions will be presented to the admin one by one
    `,
    disabled: !PERMISSIONS.APPROVE_TRANSACTION.includes(currentUser.role),
    parameters: [
      {
        name: "transactionId",
        type: "string",
        description:
          "The id of pending transaction to present to the given department admin (provided by copilot)",
        required: true,
      },
    ],
    renderAndWait: ({ args, handler, status }) => {
      const { transactionId } = args;
      if (status === "inProgress") {
        return <div>Loading...</div>;
      }

      if (!transactionId) {
        handler?.(
          "A transaction ID was not given, could be that there arent any pending approval or there was an error"
        );
        return <div>No pending transactions</div>;
      }

      async function handleChangeTransactionStatus({
        id,
        status,
      }: {
        id: string;
        status: Transaction["status"];
      }) {
        await changeTransactionStatus({ id, status });
        handler?.(`transaction ${id} ${status}`);
      }

      return (
        <TransactionsList
          transactions={transactions.filter((t) =>
            transactionId.includes(t.id)
          )}
          showApprovalInterface
          approvalInterfaceProps={{
            onApprove: (transactionId) =>
              handleChangeTransactionStatus({
                id: transactionId,
                status: "approved",
              }),
            onDeny: (transactionId) =>
              handleChangeTransactionStatus({
                id: transactionId,
                status: "denied",
              }),
          }}
        />
      );
    },
  });

  useCopilotReadable({
    description:
      "The user does not have permission to perform these actions." +
      "If they ask you to do one of these, please tell them that they " +
      "do not have permission to do so." +
      "Do not tell them they are on the wrong page, the real reason " +
      "is that they do not have permission to perform the action.",
    value: Object.keys(PERMISSIONS).filter(
      (key) =>
        !PERMISSIONS[key as keyof typeof PERMISSIONS].includes(currentUser.role)
    ),
  });

  // useCopilotReadable({
  //   description: "The user has access to the following documents",
  //   value: PERMISSIONS.READ_MSA.includes(currentUser.role) ? [FEDEX_MSA] : [],
  // });

  useCopilotChatSuggestions({
    instructions: `
      suggest actions/information in this page related to credit cards, transactions or policies.
      Use specific items or "all items", for example:
      "Show all transactions of Marketing department" or "Tell me how much I spent on my Mastercard"
      If the user has permission to e.g. add credit card, then you can suggest to add a new card.
      Do the same for other actions.
    `,
    minSuggestions: 3,
    maxSuggestions: 3,
    // className:
    //   currentUser.role === MemberRole.Admin
    //     ? "bg-purple-500 prefix-arrow text-xs p-1 rounded-sm text-white"
    //     : undefined,
  });

  if (!cards || !policies) return null;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Credit Cards</h1>
        <AddCardDropdown
          handleAddCard={handleAddCard}
          currentUser={currentUser}
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cards.length ? (
          cards.map((card) => (
            <CreditCardDetails
              key={card.id}
              card={card}
              policy={policies.find((p) => p.id === card.expensePolicyId)}
              onChangePinModalOpen={() =>
                dispatch({ dialogOpen: true, cardId: card.id })
              }
            />
          ))
        ) : (
          <div>No cards found for {currentUser.team} team</div>
        )}
      </div>

      <ChangePinDialog
        dialogOpen={state.dialogOpen}
        onSubmit={({ pin, cardId }) => handleChangePinSubmit({ pin, cardId })}
        loading={state.loading}
        onDialogOpenChange={(open) => dispatch({ dialogOpen: open })}
        cards={cards}
      />
    </div>
  );
}
