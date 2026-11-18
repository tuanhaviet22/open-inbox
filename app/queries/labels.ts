// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { FilterRule, FilterRuleInput, Label } from "~/types";
import { queryKeys } from "./keys";

export function useLabels(mailboxId: string | undefined) {
	return useQuery<Label[]>({
		queryKey: mailboxId ? queryKeys.labels.list(mailboxId) : ["labels", "_disabled"],
		queryFn: () => api.listLabels(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useCreateLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (label: { name: string; color?: string }) => api.createLabel(mailboxId, label),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels.list(mailboxId) }),
	});
}

export function useDeleteLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteLabel(mailboxId, id),
		// Deleting a label also detaches it from emails, and filters may reference it.
		onSuccess: () => qc.invalidateQueries({ queryKey: ["labels", mailboxId] }),
	});
}

export function useEmailLabels(mailboxId: string | undefined, emailId: string | undefined) {
	return useQuery<Label[]>({
		queryKey: mailboxId && emailId ? queryKeys.labels.forEmail(mailboxId, emailId) : ["labels", "_disabled"],
		queryFn: () => api.getEmailLabels(mailboxId!, emailId!),
		enabled: !!mailboxId && !!emailId,
	});
}

export function useToggleEmailLabel(mailboxId: string, emailId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ labelId, on }: { labelId: string; on: boolean }) =>
			on ? api.addEmailLabel(mailboxId, emailId, labelId) : api.removeEmailLabel(mailboxId, emailId, labelId),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels.forEmail(mailboxId, emailId) }),
	});
}

export function useFilters(mailboxId: string | undefined) {
	return useQuery<FilterRule[]>({
		queryKey: mailboxId ? queryKeys.filters.list(mailboxId) : ["filters", "_disabled"],
		queryFn: () => api.listFilters(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useSaveFilter(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, rule }: { id?: string; rule: FilterRuleInput }) =>
			id ? api.updateFilter(mailboxId, id, rule) : api.createFilter(mailboxId, rule),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.filters.list(mailboxId) }),
	});
}

export function useDeleteFilter(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteFilter(mailboxId, id),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.filters.list(mailboxId) }),
	});
}
