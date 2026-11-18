// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Member } from "~/types";
import { queryKeys } from "./keys";

export function useMe() {
	return useQuery({ queryKey: queryKeys.me, queryFn: () => api.getMe() });
}

export function useMembers(mailboxId: string | undefined) {
	return useQuery<Member[]>({
		queryKey: mailboxId ? queryKeys.members.list(mailboxId) : ["members", "_disabled"],
		queryFn: () => api.listMembers(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useSetMember(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ email, role }: { email: string; role: Member["role"] }) =>
			api.setMember(mailboxId, email, role),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.list(mailboxId) }),
	});
}

export function useRemoveMember(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (email: string) => api.removeMember(mailboxId, email),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.list(mailboxId) }),
	});
}
