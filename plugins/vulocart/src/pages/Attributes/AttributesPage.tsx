/* global vulocartLocalizer */
import { useEffect, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import axios from 'axios';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	ColumnComponent,
	ContainerComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	InformationItemComponent,
	NavigatorHeaderComponent,
	NoticeManager,
	PopupComponent,
} from '@zyra/components';
import { TableCard, TableRow } from '@zyra/table';
import { TextInput, ButtonInput } from '@zyra/inputs';
import ConfirmPopup from '../../components/ConfirmPopup/ConfirmPopup';

interface AttributeValue {
	id: number;
	value: string;
}

interface Attribute extends TableRow {
	id: number;
	name: string;
	slug: string;
	values: AttributeValue[];
}

const DEFAULT_PER_PAGE = 10;

const nonceHeaders = { headers: { 'X-WP-Nonce': vulocartLocalizer.nonce } };

/**
 * Attributes list: one card with a searchable table, a popup to add an attribute, a popup to manage its values, and a
 * confirmation lightbox before deleting.
 */
export function AttributesPage() {
	const [ attributes, setAttributes ] = useState< Attribute[] >( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ searchTerm, setSearchTerm ] = useState( '' );
	const [ paged, setPaged ] = useState( 1 );
	const [ perPage, setPerPage ] = useState( DEFAULT_PER_PAGE );

	const [ isAddOpen, setIsAddOpen ] = useState( false );
	const [ newName, setNewName ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );

	/** Id of the attribute whose values are open in the manage popup - re-read from `attributes` so it refreshes after each change. */
	const [ managingId, setManagingId ] = useState< number | null >( null );
	const [ newValue, setNewValue ] = useState( '' );
	const [ deleteTarget, setDeleteTarget ] = useState< Attribute | null >( null );
	const [ bulkDeleteIds, setBulkDeleteIds ] = useState< number[] >( [] );

	const load = () => {
		setIsLoading( true );

		getApiResponse< Attribute[] >( getApiLink( vulocartLocalizer, 'attributes' ), nonceHeaders )
			.then( ( response ) => setAttributes( response ?? [] ) )
			.finally( () => setIsLoading( false ) );
	};

	useEffect( load, [] );

	useEffect( () => {
		setPaged( 1 );
	}, [ searchTerm ] );

	const notify = ( key: string, ok: boolean, success: string, failure: string ) =>
		NoticeManager.add( {
			uniqueKey: `vulocart-attribute-${ key }`,
			type: ok ? 'success' : 'error',
			position: 'float',
			message: ok ? success : failure,
		} );

	const closeAdd = () => {
		setIsAddOpen( false );
		setNewName( '' );
	};

	const handleAddAttribute = () => {
		if ( ! newName.trim() ) {
			return;
		}

		setIsSaving( true );

		sendApiResponse( vulocartLocalizer, getApiLink( vulocartLocalizer, 'attributes' ), { name: newName } )
			.then( ( response ) => {
				notify( 'save', !! response, __( 'Attribute saved.', 'vulocart' ), __( 'Could not save this attribute.', 'vulocart' ) );

				if ( response ) {
					closeAdd();
					load();
				}
			} )
			.finally( () => setIsSaving( false ) );
	};

	const handleAddValue = ( attributeId: number ) => {
		const value = newValue.trim();

		if ( ! value ) {
			return;
		}

		sendApiResponse( vulocartLocalizer, getApiLink( vulocartLocalizer, `attributes/${ attributeId }/values` ), { value } ).then( ( response ) => {
			if ( response ) {
				setNewValue( '' );
				load();
			} else {
				notify( 'value', false, '', __( 'Could not add this value.', 'vulocart' ) );
			}
		} );
	};

	const handleDeleteValue = ( valueId: number ) => {
		axios.delete( getApiLink( vulocartLocalizer, `attributes/values/${ valueId }` ), nonceHeaders ).then( load );
	};

	const handleConfirmDelete = () => {
		if ( ! deleteTarget ) {
			return;
		}

		const attribute = deleteTarget;
		setDeleteTarget( null );

		axios
			.delete( getApiLink( vulocartLocalizer, `attributes/${ attribute.id }` ), nonceHeaders )
			.then( () => {
				notify( 'delete', true, __( 'Attribute deleted.', 'vulocart' ), '' );
				load();
			} )
			.catch( () => notify( 'delete', false, '', __( 'Could not delete this attribute.', 'vulocart' ) ) );
	};

	const confirmBulkDelete = () => {
		const ids = bulkDeleteIds;
		setBulkDeleteIds( [] );

		Promise.all( ids.map( ( id ) => axios.delete( getApiLink( vulocartLocalizer, `attributes/${ id }` ), nonceHeaders ) ) )
			.then( () => notify( 'delete', true, __( 'Selected attributes deleted.', 'vulocart' ), '' ) )
			.finally( load );
	};

	const visibleAttributes = attributes.filter( ( attribute ) => {
		const query = searchTerm.trim().toLowerCase();

		return (
			! query ||
			attribute.name.toLowerCase().includes( query ) ||
			attribute.values.some( ( value ) => value.value.toLowerCase().includes( query ) )
		);
	} );

	const pageRows = visibleAttributes.slice( ( paged - 1 ) * perPage, paged * perPage );
	const managing = attributes.find( ( attribute ) => attribute.id === managingId ) ?? null;

	const headers = {
		name: {
			label: __( 'Attribute', 'vulocart' ),
			render: ( row: Attribute ) => (
				<InformationItemComponent
					title={ row.name }
					badges={ [
						{ text: row.slug, className: 'badge-info' },
						{
							text: sprintf(
								/* translators: %d: number of values. */
								_n( '%d Value', '%d Values', row.values.length, 'vulocart' ),
								row.values.length
							),
							className: 'blue',
						},
					] }
					descriptions={
						row.values.length
							? [ { icon: 'tag', label: __( 'Values', 'vulocart' ), value: row.values.map( ( value ) => value.value ).join( ', ' ) } ]
							: []
					}
				/>
			),
		},
		actions: {
			label: __( 'Actions', 'vulocart' ),
			type: 'action',
			actions: [
				{
					label: __( 'Manage values', 'vulocart' ),
					icon: 'edit',
					type: 'button',
					color: 'text-blue',
					onClick: ( row: Record< string, unknown > ) => {
						setNewValue( '' );
						setManagingId( ( row as unknown as Attribute ).id );
					},
				},
				{
					label: __( 'Delete', 'vulocart' ),
					icon: 'delete',
					type: 'button',
					color: 'text-red',
					onClick: ( row: Record< string, unknown > ) => setDeleteTarget( row as unknown as Attribute ),
				},
			],
		},
	};

	return (
		<ContainerComponent general>
			<ColumnComponent>
				<NavigatorHeaderComponent
					headerIcon="product-options"
					headerTitle={ __( 'Attributes', 'vulocart' ) }
					headerDescription={ __( 'Named properties products can be described by - e.g. "Color" with values Red/Blue/Green.', 'vulocart' ) }
					headerCustomContent={ <ButtonInput buttons={ [ { text: __( 'Add attribute', 'vulocart' ), icon: 'plus', color: '', onClick: () => setIsAddOpen( true ) } ] } /> }
				/>

				<TableCard
						showMenu={ false }
						headers={ headers }
						rows={ pageRows }
						ids={ pageRows.map( ( row ) => row.id ) }
						totalRows={ visibleAttributes.length }
						isLoading={ isLoading }
						search={ { placeholder: __( 'Search by attribute or value…', 'vulocart' ) } }
						bulkActions={ [ { label: __( 'Delete', 'vulocart' ), value: 'delete' } ] }
						onBulkActionApply={ ( action: string, ids: number[] ) => 'delete' === action && ids.length && setBulkDeleteIds( ids ) }
						onQueryUpdate={ ( query: { paged?: number | string; per_page?: number | string; searchValue?: string } ) => {
							setPaged( Number( query.paged ) || 1 );
							setPerPage( Number( query.per_page ) || DEFAULT_PER_PAGE );
							setSearchTerm( query.searchValue ?? '' );
						} }
						emptyMessage={ __( 'No attributes yet - add the first one.', 'vulocart' ) }
				/>

				<PopupComponent
					open={ isAddOpen }
					onClose={ closeAdd }
					width={ 28 }
					height="auto"
					position="lightbox"
					header={ { title: __( 'Add attribute', 'vulocart' ), icon: 'plus' } }
					footer={
						<ButtonInput
							buttons={ {
								text: isSaving ? __( 'Saving…', 'vulocart' ) : __( 'Save', 'vulocart' ),
								icon: 'save',
								onClick: handleAddAttribute,
								disabled: isSaving || ! newName.trim(),
							} }
						/>
					}
				>
					<FormGroupWrapperComponent>
						<FormGroupComponent label={ __( 'Name', 'vulocart' ) } htmlFor="vulocart-attribute-name">
							<TextInput
								name="name"
								type="text"
								placeholder={ __( 'e.g. Color', 'vulocart' ) }
								value={ newName }
								onChange={ ( value ) => setNewName( value as string ) }
							/>
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</PopupComponent>

				<PopupComponent
					open={ !! managing }
					onClose={ () => setManagingId( null ) }
					width={ 28 }
					height="auto"
					position="lightbox"
					header={ {
						/* translators: %s: attribute name. */
						title: sprintf( __( '%s values', 'vulocart' ), managing?.name ?? '' ),
						icon: 'edit',
					} }
					footer={
						<ButtonInput
							buttons={ {
								text: __( 'Add value', 'vulocart' ),
								icon: 'plus',
								onClick: () => managing && handleAddValue( managing.id ),
								disabled: ! newValue.trim(),
							} }
						/>
					}
				>
					<FormGroupWrapperComponent>
						<FormGroupComponent label={ __( 'New value', 'vulocart' ) } htmlFor="vulocart-attribute-value">
							<TextInput
								name="value"
								type="text"
								placeholder={ __( 'e.g. Red', 'vulocart' ) }
								value={ newValue }
								onChange={ ( value ) => setNewValue( value as string ) }
							/>
						</FormGroupComponent>
						<FormGroupComponent label={ __( 'Current values', 'vulocart' ) }>
							<div className="tag-wrapper">
								{ managing && managing.values.length === 0 && <span className="desc">{ __( 'No values yet.', 'vulocart' ) }</span> }
								{ managing?.values.map( ( value ) => (
									<span key={ value.id } className="admin-badge zyra-blue">
										{ value.value }{ ' ' }
										<a
											href="#remove"
											aria-label={ __( 'Remove value', 'vulocart' ) }
											onClick={ ( event ) => {
												event.preventDefault();
												handleDeleteValue( value.id );
											} }
										>
											×
										</a>
									</span>
								) ) }
							</div>
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</PopupComponent>

				<ConfirmPopup
					open={ !! deleteTarget }
					title={ __( 'Delete Attribute', 'vulocart' ) }
					message={ __( 'Delete this attribute and all its values? This cannot be undone.', 'vulocart' ) }
					onConfirm={ handleConfirmDelete }
					onCancel={ () => setDeleteTarget( null ) }
				/>

				<ConfirmPopup
					open={ bulkDeleteIds.length > 0 }
					title={ __( 'Delete selected', 'vulocart' ) }
					message={ __( 'Delete the selected attributes and their values? This cannot be undone.', 'vulocart' ) }
					onConfirm={ confirmBulkDelete }
					onCancel={ () => setBulkDeleteIds( [] ) }
				/>
			</ColumnComponent>
		</ContainerComponent>
	);
}

export default AttributesPage;
